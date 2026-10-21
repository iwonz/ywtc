class Ywtc < Formula
  desc "Transfer Yandex Wiki and Confluence content or export it to files"
  homepage "https://github.com/iwonz/ywtc"
  url "https://registry.npmjs.org/@iwonz/ywtc/-/ywtc-4.1.5.tgz"
  sha256 "498a1eca0ff97782174378fbc716480778df9e539bfaed96e97afdfd4d88d56e"
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
