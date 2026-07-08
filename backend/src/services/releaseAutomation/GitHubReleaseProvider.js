function normalizeRepoUrl(owner, repo) {
  return `https://github.com/${owner}/${repo}`;
}

function parseRepository(input = {}) {
  if (input.repositoryUrl) {
    const match = String(input.repositoryUrl).trim().match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)\/?$/i);
    if (!match) {
      const err = new Error("GitHub repository URL must use https://github.com/{owner}/{repo}.");
      err.statusCode = 422;
      throw err;
    }
    return { owner: match[1], repo: match[2].replace(/\.git$/i, ""), repositoryUrl: normalizeRepoUrl(match[1], match[2].replace(/\.git$/i, "")) };
  }
  const owner = String(input.owner || "").trim();
  const repo = String(input.repo || "").trim().replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,160}$/.test(repo)) {
    const err = new Error("GitHub owner and repository are required.");
    err.statusCode = 422;
    throw err;
  }
  return { owner, repo, repositoryUrl: normalizeRepoUrl(owner, repo) };
}

function inferChannel(tag = "", prerelease = false) {
  const value = String(tag).toLowerCase();
  if (value.includes("alpha")) return "alpha";
  if (value.includes("beta")) return "beta";
  if (value.includes("rc") || value.includes("release-candidate")) return "release_candidate";
  return prerelease ? "beta" : "stable";
}

function inferVersion(tag = "") {
  const match = String(tag).match(/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/);
  return match ? match[1] : "";
}

function normalizeReleasePayload(payload = {}) {
  return {
    releaseTag: payload.tag_name || payload.releaseTag || payload.tag || "",
    releaseTitle: payload.name || payload.releaseTitle || "",
    releaseNotes: payload.body || payload.releaseNotes || "",
    changelog: payload.changelog || payload.body || "",
    releaseDate: payload.published_at || payload.created_at || payload.releaseDate || new Date(),
    releaseChannel: payload.releaseChannel || inferChannel(payload.tag_name || payload.releaseTag, Boolean(payload.prerelease)),
    build: {
      commitSha: payload.target_commitish || payload.commitSha || "",
      branch: payload.branch || payload.default_branch || "",
      buildNumber: payload.run_number || payload.buildNumber || "",
      buildTimestamp: payload.buildTimestamp || payload.published_at || payload.created_at || new Date(),
      githubReleaseId: String(payload.id || payload.githubReleaseId || ""),
      githubAssetId: String(payload.asset?.id || payload.githubAssetId || ""),
    },
    asset: payload.asset || null,
    versionNumber: payload.versionNumber || inferVersion(payload.tag_name || payload.releaseTag),
  };
}

module.exports = {
  id: "github",
  name: "GitHub",
  parseRepository,
  normalizeReleasePayload,
  inferChannel,
  inferVersion,
};
