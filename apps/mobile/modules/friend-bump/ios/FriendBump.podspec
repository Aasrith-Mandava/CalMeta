Pod::Spec.new do |s|
  s.name = 'FriendBump'
  s.version = '0.1.0'
  s.summary = 'Foreground, mutually confirmed two-person encounters for 200 Hours'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = '200 Hours'
  s.homepage = 'https://expo.dev'
  s.source = { :git => '' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MultipeerConnectivity', 'CoreMotion', 'UIKit'
  s.source_files = '**/*.swift'
end
