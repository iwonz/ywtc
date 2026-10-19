class Ywtc < Formula
  desc "Transfer Yandex Wiki and Confluence content or export it to files"
  homepage "https://github.com/iwonz/ywtc"
  url "https://registry.npmjs.org/@iwonz/ywtc/-/ywtc-4.1.3.tgz"
  sha256 "4e93e440baa2cec0e4f0e997b0880447db924a9b440c533d9a78757fe2f1a746"
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
