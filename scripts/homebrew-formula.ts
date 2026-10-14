import {writeFile} from 'node:fs/promises';

export interface FormulaInput {
  version: string;
  url: string;
  sha256: string;
}

function rubyString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export function renderHomebrewFormula(input: FormulaInput): string {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(input.version)) throw new Error('Formula version must be SemVer');
  if (!/^https:\/\//.test(input.url)) throw new Error('Formula URL must use HTTPS');
  if (!/^[a-f0-9]{64}$/i.test(input.sha256)) throw new Error('Formula SHA-256 must contain 64 hexadecimal characters');
  return `class Ywtc < Formula
  desc "Migrate Yandex Wiki sections to Confluence"
  homepage "https://github.com/iwonz/ywtc"
  url "${rubyString(input.url)}"
  sha256 "${input.sha256.toLowerCase()}"
  license "MIT"
  version "${input.version}"

  depends_on "node@22"

  def install
    system "npm", "install", "--global", "--prefix", libexec, cached_download
    bin.install_symlink Dir[libexec/"bin/*"]
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/ywtc --version")
    assert_match "ywtc", shell_output("#{bin}/ywtc --help")
  end
end
`;
}

if (process.argv[1]?.endsWith('homebrew-formula.ts')) {
  const [version, url, sha256, output] = process.argv.slice(2);
  if (!version || !url || !sha256 || !output) {
    throw new Error('Usage: homebrew-formula.ts <version> <registry-url> <sha256> <output>');
  }
  await writeFile(output, renderHomebrewFormula({version, url, sha256}), 'utf8');
}
