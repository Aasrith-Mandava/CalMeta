import ExpoModulesCore
import MultipeerConnectivity
import CoreMotion
import UIKit

public final class FriendBumpModule: Module {
  private var coordinator: BumpCoordinator?

  public func definition() -> ModuleDefinition {
    Name("FriendBump")
    Events("onState")
    AsyncFunction("start") { (code: String) in
      #if targetEnvironment(simulator)
      throw NSError(domain: "FriendBump", code: 1, userInfo: [NSLocalizedDescriptionKey: "Bumping needs two real iPhones."])
      #else
      guard code.range(of: "^[A-Z0-9]{6}$", options: .regularExpression) != nil else {
        throw NSError(domain: "FriendBump", code: 2, userInfo: [NSLocalizedDescriptionKey: "Create a fresh invitation first."])
      }
      self.coordinator?.stop()
      let coordinator = BumpCoordinator(code: code) { [weak self] event in self?.sendEvent("onState", event) }
      self.coordinator = coordinator
      try coordinator.start()
      #endif
    }.runOnQueue(.main)
    AsyncFunction("stop") {
      self.coordinator?.stop()
      self.coordinator = nil
    }.runOnQueue(.main)
    OnDestroy {
      let running = self.coordinator
      DispatchQueue.main.async { running?.stop() }
    }
  }
}

// No profile or backend invitation is advertised. Only an ephemeral random peer ID is visible.
// This prototype uses one-peer discovery + two motion events, not UWB distance verification.
private final class BumpCoordinator: NSObject, MCSessionDelegate, MCNearbyServiceAdvertiserDelegate, MCNearbyServiceBrowserDelegate {
  private let service = "hours-bump"
  private let peer = MCPeerID(displayName: UUID().uuidString)
  private let code: String
  private let emit: ([String: Any]) -> Void
  private let motion = CMMotionManager()
  private var session: MCSession!
  private var browser: MCNearbyServiceBrowser?
  private var advertiser: MCNearbyServiceAdvertiser?
  private var peers = Set<MCPeerID>()
  private var localBumpAt: TimeInterval = -100
  private var remoteBumpAt: TimeInterval = -100
  private var lastMotionAt: TimeInterval = -100
  private var localQualified = false
  private var remoteQualified = false
  private var matched = false
  private var active = false
  private var invitationSent = false
  private var timeout: DispatchWorkItem?
  private var backgroundObserver: NSObjectProtocol?
  private var handshakeTimeout: DispatchWorkItem?
  private var pendingCode: String?

  init(code: String, emit: @escaping ([String: Any]) -> Void) {
    self.code = code
    self.emit = emit
    super.init()
  }

  func start() throws {
    guard motion.isDeviceMotionAvailable else {
      throw NSError(domain: "FriendBump", code: 3, userInfo: [NSLocalizedDescriptionKey: "Motion sensing is unavailable. Use the invitation code instead."])
    }
    active = true
    session = MCSession(peer: peer, securityIdentity: nil, encryptionPreference: .required)
    session.delegate = self
    advertiser = MCNearbyServiceAdvertiser(peer: peer, discoveryInfo: ["v": "1"], serviceType: service)
    advertiser?.delegate = self
    browser = MCNearbyServiceBrowser(peer: peer, serviceType: service)
    browser?.delegate = self
    advertiser?.startAdvertisingPeer()
    browser?.startBrowsingForPeers()
    motion.deviceMotionUpdateInterval = 1.0 / 50.0
    motion.startDeviceMotionUpdates(to: .main) { [weak self] sample, error in
      guard let self, self.active else { return }
      if error != nil { self.fail("Motion permission is unavailable. Use the code instead."); return }
      guard let sample, self.peers.count == 1, self.session.connectedPeers.count == 1, !self.matched else { return }
      let a = sample.userAcceleration
      let magnitude = sqrt(a.x * a.x + a.y * a.y + a.z * a.z)
      let now = ProcessInfo.processInfo.systemUptime
      guard magnitude > 1.6, now - self.lastMotionAt > 1.5 else { return }
      self.lastMotionAt = now
      self.localBumpAt = now
      self.send(["kind": "bump"])
      self.qualify()
    }
    backgroundObserver = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
      self?.fail("Bump paused. Keep both apps open and try again.")
    }
    let timeout = DispatchWorkItem { [weak self] in self?.fail("No bump yet. Check Wi-Fi, Bluetooth, and Local Network permission, then try again.") }
    self.timeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 60, execute: timeout)
    emit(["stage": "searching", "message": "Keep both phones open. Looking for one other person…"])
  }

  func stop() {
    active = false
    timeout?.cancel()
    handshakeTimeout?.cancel()
    if let backgroundObserver { NotificationCenter.default.removeObserver(backgroundObserver) }
    backgroundObserver = nil
    motion.stopDeviceMotionUpdates()
    browser?.stopBrowsingForPeers()
    advertiser?.stopAdvertisingPeer()
    session?.disconnect()
    browser?.delegate = nil
    advertiser?.delegate = nil
    session?.delegate = nil
    peers.removeAll()
  }

  private func fail(_ message: String) {
    guard active else { return }
    emit(["stage": "error", "message": message])
    stop()
  }

  private var isHost: Bool {
    guard let other = session?.connectedPeers.first else { return false }
    return peer.displayName < other.displayName
  }

  private var verification: String {
    guard let other = session.connectedPeers.first else { return "" }
    return [peer.displayName, other.displayName].sorted().map { String($0.prefix(2)) }.joined(separator: " · ")
  }

  private func send(_ packet: [String: String]) {
    guard active, session.connectedPeers.count == 1, let data = try? JSONSerialization.data(withJSONObject: packet) else { return }
    do { try session.send(data, toPeers: session.connectedPeers, with: .reliable) }
    catch { fail("The other phone disconnected. Try again or use a code.") }
  }

  private func qualify() {
    guard active, peers.count == 1, session.connectedPeers.count == 1, !localQualified else { return }
    let now = ProcessInfo.processInfo.systemUptime
    guard now - localBumpAt < 1.2, now - remoteBumpAt < 1.2 else { return }
    localQualified = true
    send(["kind": "qualified"])
    let timeout = DispatchWorkItem { [weak self] in
      guard let self, !self.matched else { return }
      self.localQualified = false
      self.remoteQualified = false
      self.pendingCode = nil
      self.localBumpAt = -100
      self.remoteBumpAt = -100
      self.emit(["stage": "paired", "verification": self.verification, "message": "Try the gentle bump again together."])
    }
    handshakeTimeout?.cancel()
    handshakeTimeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 3, execute: timeout)
    finishIfReady()
  }

  private func finishIfReady() {
    guard active, localQualified, remoteQualified, peers.count == 1, !matched else { return }
    if isHost {
      send(["kind": "invitation", "code": code])
      deliver(code: code, host: true)
    } else if let pendingCode {
      deliver(code: pendingCode, host: false)
    }
  }

  private func deliver(code: String, host: Bool) {
    guard active, !matched else { return }
    matched = true
    timeout?.cancel()
    handshakeTimeout?.cancel()
    motion.stopDeviceMotionUpdates()
    UINotificationFeedbackGenerator().notificationOccurred(.success)
    emit(["stage": "matched", "code": code, "isHost": host, "verification": verification])
  }

  private func onMain(_ action: @escaping () -> Void) {
    DispatchQueue.main.async { [weak self] in guard self?.active == true else { return }; action() }
  }

  func browser(_ browser: MCNearbyServiceBrowser, foundPeer peerID: MCPeerID, withDiscoveryInfo info: [String: String]?) {
    onMain { [weak self] in
      guard let self, info?["v"] == "1" else { return }
      self.peers.insert(peerID)
      if self.peers.count > 1 {
        self.emit(["stage": "ambiguous", "message": "Several phones are ready. Move away from other participants and try again, or use a code."])
        self.stop()
        return
      }
      guard self.peer.displayName < peerID.displayName, !self.invitationSent else { return }
      self.invitationSent = true
      browser.invitePeer(peerID, to: self.session, withContext: nil, timeout: 15)
    }
  }

  func browser(_ browser: MCNearbyServiceBrowser, lostPeer peerID: MCPeerID) {
    onMain { [weak self] in
      guard let self else { return }
      self.peers.remove(peerID)
      if !self.matched { self.fail("The other phone moved away. Try again.") }
    }
  }

  func browser(_ browser: MCNearbyServiceBrowser, didNotStartBrowsingForPeers error: Error) {
    onMain { [weak self] in self?.fail("Nearby discovery could not start. Enable Local Network access in Settings.") }
  }

  func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didReceiveInvitationFromPeer peerID: MCPeerID, withContext context: Data?, invitationHandler: @escaping (Bool, MCSession?) -> Void) {
    DispatchQueue.main.async { [weak self] in
      guard let self, self.active, self.peer.displayName > peerID.displayName,
        self.peers.count <= 1, self.session.connectedPeers.isEmpty,
        self.peers.isEmpty || self.peers.contains(peerID) else { invitationHandler(false, nil); return }
      self.peers.insert(peerID)
      invitationHandler(true, self.session)
    }
  }

  func advertiser(_ advertiser: MCNearbyServiceAdvertiser, didNotStartAdvertisingPeer error: Error) {
    onMain { [weak self] in self?.fail("Nearby sharing could not start. Enable Local Network access in Settings.") }
  }

  func session(_ session: MCSession, peer peerID: MCPeerID, didChange state: MCSessionState) {
    onMain { [weak self] in
      guard let self else { return }
      if state == .connected {
        guard self.peers.count == 1, session.connectedPeers.count == 1 else { self.fail("Pairing was ambiguous. Use a code to choose the right person."); return }
        self.emit(["stage": "paired", "verification": self.verification, "message": "Check the symbols match on both screens, then gently bump your phones together."])
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
      } else if state == .notConnected && !self.matched {
        self.fail("The other phone disconnected. Try again.")
      }
    }
  }

  func session(_ session: MCSession, didReceive data: Data, fromPeer peerID: MCPeerID) {
    guard data.count <= 256, let packet = (try? JSONSerialization.jsonObject(with: data)) as? [String: String] else { return }
    onMain { [weak self] in
      guard let self, self.session === session, self.peers.contains(peerID), session.connectedPeers.count == 1, !self.matched else { return }
      switch packet["kind"] {
      case "bump":
        self.remoteBumpAt = ProcessInfo.processInfo.systemUptime
        self.qualify()
      case "qualified":
        // A qualification is meaningful only in this brief, local motion window.
        guard ProcessInfo.processInfo.systemUptime - self.localBumpAt < 3 else { return }
        self.remoteQualified = true
        self.finishIfReady()
      case "invitation":
        guard !self.isHost, let code = packet["code"], code.range(of: "^[A-Z0-9]{6}$", options: .regularExpression) != nil else { return }
        self.pendingCode = code
        self.finishIfReady()
      default: break
      }
    }
  }
  func session(_ session: MCSession, didReceive stream: InputStream, withName name: String, fromPeer peerID: MCPeerID) { stream.close() }
  func session(_ session: MCSession, didStartReceivingResourceWithName name: String, fromPeer peerID: MCPeerID, with progress: Progress) {}
  func session(_ session: MCSession, didFinishReceivingResourceWithName name: String, fromPeer peerID: MCPeerID, at localURL: URL?, withError error: Error?) {}
}
