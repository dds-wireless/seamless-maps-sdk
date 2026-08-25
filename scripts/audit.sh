#!/usr/bin/env bash
# Repository governance checks. Fails the build; CI runs it.
# Ported from the platform repository's check-docs.sh - only the checks that
# survive the boundary, plus the public-repository set (ADR-053 decision 7).
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

fails=0
pass() { printf '  \033[32mok\033[0m   %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fails=$((fails + 1)); }

echo
echo "  seamless-maps-sdk :: exit audit"
echo

# --- 1. The public-repository set exists -------------------------------------
for f in LICENSE SECURITY.md CONTRIBUTING.md CHANGELOG.md README.md AGENTS.md \
         .github/PULL_REQUEST_TEMPLATE.md .github/ISSUE_TEMPLATE/bug_report.yml; do
  [ -f "$f" ] && pass "$f present" || fail "$f is missing"
done

# --- 2. No stray markdown at the root ----------------------------------------
allowed="LICENSE README.md CHANGELOG.md CONTRIBUTING.md SECURITY.md AGENTS.md"
stray=""
for f in ./*.md; do
  [ -e "$f" ] || continue
  base="$(basename "$f")"
  case " $allowed " in *" $base "*) ;; *) stray="$stray $base" ;; esac
done
[ -z "$stray" ] && pass "no stray markdown at the repository root" \
                || fail "stray markdown at the root:$stray"

# --- 3. Every ledger's status matches its folder ------------------------------
ledger_fail=0
for f in plans/active/*.md; do
  [ -e "$f" ] || continue
  case "$f" in */_templates/*) continue ;; esac
  status="$(grep -m1 '^status:' "$f" | awk '{print $2}')"
  [ "$status" = "done" ] && { fail "$f is status: done but still in plans/active/"; ledger_fail=1; }
  grep -q '^review-by:' "$f" || { fail "$f has no review-by:"; ledger_fail=1; }
done
for f in plans/done/*.md; do
  [ -e "$f" ] || continue
  status="$(grep -m1 '^status:' "$f" | awk '{print $2}')"
  [ "$status" = "done" ] || { fail "$f is in plans/done/ but status: ${status:-missing}"; ledger_fail=1; }
done
[ "$ledger_fail" -eq 0 ] && pass "every ledger's status matches its folder"

# --- 4. Every ledger is registered in the index -------------------------------
index_fail=0
for f in plans/active/*.md plans/done/*.md; do
  [ -e "$f" ] || continue
  case "$f" in */_templates/*) continue ;; esac
  grep -q "$(basename "$f")" plans/README.md 2>/dev/null \
    || { fail "$(basename "$f") is not registered in plans/README.md"; index_fail=1; }
done
[ "$index_fail" -eq 0 ] && pass "every ledger is registered in plans/README.md"

# --- 5. Every ADR is indexed --------------------------------------------------
adr_fail=0
for f in docs/adr/*.md; do
  [ -e "$f" ] || continue
  case "$(basename "$f")" in README.md) continue ;; esac
  grep -q "$(basename "$f")" docs/adr/README.md 2>/dev/null \
    || { fail "$(basename "$f") is not indexed in docs/adr/README.md"; adr_fail=1; }
done
[ "$adr_fail" -eq 0 ] && pass "every ADR is indexed in docs/adr/README.md"

# --- 6. Generated artifacts carry their warning -------------------------------
grep -q 'auto-generated' src/generated/dataplane.ts 2>/dev/null \
  && pass "src/generated/dataplane.ts is marked generated" \
  || fail "src/generated/dataplane.ts is missing or not marked generated"

# --- 7. No runtime dependencies ----------------------------------------------
deps="$(node -p "Object.keys(require('./package.json').dependencies||{}).join(' ')")"
[ -z "$deps" ] && pass "no runtime dependencies" \
                || fail "runtime dependencies present: $deps"

# --- 8. No unmasked live key anywhere ----------------------------------------
if grep -rIn --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git \
     -E '\b(pk|sk)_live_[A-Za-z0-9]{8,}' . >/dev/null 2>&1; then
  fail "an unmasked live key appears in the working tree"
else
  pass "no unmasked live key in the working tree"
fi

# --- 9. The committed contract parses and matches the generated types ---------
if node -e "JSON.parse(require('fs').readFileSync('openapi.json','utf8'))" >/dev/null 2>&1; then
  pass "openapi.json parses"
else
  fail "openapi.json does not parse"
fi

echo
if [ "$fails" -eq 0 ]; then
  printf '  \033[32maudit passed\033[0m\n\n'
  exit 0
fi
printf '  \033[31maudit failed: %s problem(s)\033[0m\n\n' "$fails"
exit 1
