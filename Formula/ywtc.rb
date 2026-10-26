class Ywtc < Formula
  desc "Transfer Yandex Wiki and Confluence content or export it to files"
  homepage "https://github.com/iwonz/ywtc"
  url "https://registry.npmjs.org/@iwonz/ywtc/-/ywtc-5.1.0.tgz"
  sha256 "98fa070b56ba7d9c23b98112a14e6eedc0000063a615bdc6641f1f11244b6894"
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
