class Ywtc < Formula
  desc "Transfer Yandex Wiki and Confluence content or export it to files"
  homepage "https://github.com/iwonz/ywtc"
  url "https://registry.npmjs.org/@iwonz/ywtc/-/ywtc-5.0.0.tgz"
  sha256 "9f10bb53f88db3f61cb67bfb694bfb1cfbbf5c5259985fc471b4f77f8624940e"
  license "MIT"

  depends_on "node@24"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ywtc --version")
    assert_match "ywtc", shell_output("#{bin}/ywtc --help")
  end
end
