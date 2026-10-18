#!/usr/bin/env bash
set -euo pipefail

node_version="22.23.1"
case "$(uname -m)" in
  x86_64) node_arch="x64"; node_sha="9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578" ;;
  aarch64|arm64) node_arch="arm64"; node_sha="0294e8b915ab75f92c7513d2fcb830ae06e10684e6c603e99a87dbf8835389c1" ;;
  *) printf 'Unsupported CI architecture: %s\n' "$(uname -m)" >&2; exit 1 ;;
esac

tools_root="${CI_PROJECT_DIR:-$PWD}/.ci-tools"
archive_name="node-v${node_version}-linux-${node_arch}.tar.xz"
archive="$tools_root/$archive_name"
install_root="$tools_root/node-v${node_version}-linux-${node_arch}"
expected_version="v$node_version"
install -d "$tools_root"

if [[ ! -x "$install_root/bin/node" || "$($install_root/bin/node --version 2>/dev/null || true)" != "$expected_version" ]]; then
  download="$archive.part-${CI_JOB_ID:-local}"
  if [[ ! -f "$archive" ]] || ! printf '%s  %s\n' "$node_sha" "$archive" | sha256sum --check --status; then
    command -v curl >/dev/null 2>&1 || { printf 'curl is required to install the pinned CI Node.js toolchain.\n' >&2; exit 1; }
    curl --fail --silent --show-error --location \
      "https://nodejs.org/download/release/v${node_version}/${archive_name}" \
      --output "$download"
    printf '%s  %s\n' "$node_sha" "$download" | sha256sum --check --status
    mv -f "$download" "$archive"
  fi

  unpack="$(mktemp -d "$tools_root/unpack.XXXXXX")"
  tar -xJf "$archive" -C "$unpack"
  if [[ -e "$install_root" ]]; then
    mv "$install_root" "$install_root.invalid-${CI_JOB_ID:-local}"
  fi
  mv "$unpack/node-v${node_version}-linux-${node_arch}" "$install_root"
  rmdir "$unpack"
fi

export PATH="$install_root/bin:$PATH"
[[ "$(node --version)" == "$expected_version" ]] || { printf 'Pinned Node.js activation failed.\n' >&2; exit 1; }
printf 'Using Node.js %s with npm %s.\n' "$(node --version)" "$(npm --version)"
