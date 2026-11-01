require 'xcodeproj'
root = File.expand_path(__dir__)
project = Xcodeproj::Project.new(File.join(root, 'Navigator.xcodeproj'))
target = project.new_target(:application, 'Navigator', :ios, '17.0')
sources = project.main_group.new_group('Navigator', 'Navigator')
Dir.glob(File.join(root, 'Navigator/**/*.{swift,m,h}')).sort.each do |file|
  ref = sources.new_file(file.delete_prefix(root + '/Navigator/'))
  target.source_build_phase.add_file_reference(ref) unless file.end_with?('.h')
end
['Assets.xcassets','Resources/LaunchScreen.storyboard','Resources/PrivacyInfo.xcprivacy','Resources/ThirdPartyNotices.txt','Resources/bridge.js','Resources/native.css'].each do |file|
  target.resources_build_phase.add_file_reference(sources.new_file(file))
end
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER'=>'app.navigator.ios', 'PRODUCT_NAME'=>'Navigator',
    'SWIFT_VERSION'=>'5.0', 'SWIFT_STRICT_CONCURRENCY'=>'complete',
    'SWIFT_APPROACHABLE_CONCURRENCY'=>'YES', 'SWIFT_OBJC_BRIDGING_HEADER'=>'Navigator/Playback/NativeVLC.h',
    'TARGETED_DEVICE_FAMILY'=>'1,2', 'INFOPLIST_FILE'=>'Navigator/Resources/Info.plist',
    'ASSETCATALOG_COMPILER_APPICON_NAME'=>'AppIcon', 'ENABLE_USER_SCRIPT_SANDBOXING'=>'NO',
    'CODE_SIGNING_ALLOWED'=>'NO', 'CODE_SIGNING_REQUIRED'=>'NO',
    'CURRENT_PROJECT_VERSION'=>'1', 'MARKETING_VERSION'=>'0.1.0',
    'LD_RUNPATH_SEARCH_PATHS'=>['$(inherited)','@executable_path/Frameworks'],
    'GENERATE_INFOPLIST_FILE'=>'NO', 'CLANG_ENABLE_MODULES'=>'YES',
    'SUPPORTS_MACCATALYST'=>'NO', 'SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD'=>'NO'
  })
end
tests = project.new_target(:ui_test_bundle, 'NavigatorUITests', :ios, '17.0')
tests.add_dependency(target)
test_group = project.main_group.new_group('NavigatorUITests', 'NavigatorUITests')
Dir.glob(File.join(root,'NavigatorUITests/*.swift')).each { |f| tests.source_build_phase.add_file_reference(test_group.new_file(File.basename(f))) }
tests.build_configurations.each do |config|
  config.build_settings.merge!({'PRODUCT_BUNDLE_IDENTIFIER'=>'app.navigator.ios.uitests','SWIFT_VERSION'=>'5.0','GENERATE_INFOPLIST_FILE'=>'YES','TEST_TARGET_NAME'=>'Navigator','CODE_SIGNING_ALLOWED'=>'NO','TARGETED_DEVICE_FAMILY'=>'1,2'})
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(target, tests, :launch_target => true)
scheme.save_as(project.path, 'Navigator', true)
