class Ywtc < Formula
  desc "Transfer Yandex Wiki and Confluence content or export it to files"
  homepage "https://github.com/iwonz/ywtc"
  url "https://registry.npmjs.org/@iwonz/ywtc/-/ywtc-5.1.1.tgz"
  sha256 "fa2605d2eb95dc0d74b57ff77b9a7307bb19dc6c06fe3e746cbc18b64a8a5ed6"
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
