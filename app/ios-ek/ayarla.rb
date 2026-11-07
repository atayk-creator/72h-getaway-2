# iOS projesine mağaza ayarlarını uygular (CI'da "npx cap add ios" sonrası çalışır):
#  - PrivacyInfo.xcprivacy dosyasını App hedefine kaynak olarak ekler (yoksa)
#  - Yalnızca iPhone (TARGETED_DEVICE_FAMILY = 1)
require "xcodeproj"
proj_path = ARGV[0] || "ios/App/App.xcodeproj"
proj = Xcodeproj::Project.open(proj_path)
target = proj.targets.find { |t| t.name == "App" } or abort "App hedefi yok"
group = proj.main_group.children.find { |g| g.respond_to?(:path) && g.path == "App" } || proj.main_group
ref = proj.files.find { |f| f.path && File.basename(f.path) == "PrivacyInfo.xcprivacy" }
unless ref
  ref = group.new_reference("PrivacyInfo.xcprivacy")
  puts "PrivacyInfo.xcprivacy projeye eklendi"
end
unless target.resources_build_phase.files_references.include?(ref)
  target.resources_build_phase.add_file_reference(ref, true)
  puts "PrivacyInfo.xcprivacy kaynaklara eklendi"
end
target.build_configurations.each { |c| c.build_settings["TARGETED_DEVICE_FAMILY"] = "1" }
proj.save
puts "iOS proje ayarları tamam"
