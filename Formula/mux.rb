class Mux < Formula
  desc "The official Mux CLI"
  homepage "https://github.com/muxinc/cli"
  version "0.0.0"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/muxinc/cli/releases/download/v#{version}/mux-darwin-arm64"
      sha256 "PLACEHOLDER"
    else
      url "https://github.com/muxinc/cli/releases/download/v#{version}/mux-darwin-x64"
      sha256 "PLACEHOLDER"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/muxinc/cli/releases/download/v#{version}/mux-linux-arm64"
      sha256 "PLACEHOLDER"
    else
      url "https://github.com/muxinc/cli/releases/download/v#{version}/mux-linux-x64"
      sha256 "PLACEHOLDER"
    end
  end

  def install
    binary = Dir.glob("mux-*").first || "mux"
    bin.install binary => "mux"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/mux --version")
  end
end
