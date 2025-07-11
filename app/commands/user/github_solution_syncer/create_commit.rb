class User::GithubSolutionSyncer
  class CreateCommit
    include Mandate

    # Expects files to be an array of hashes, with the
    # keys path, mode, type and content.
    initialize_with :syncer, :files, :commit_message, :branch_name, token: nil

    def call
      return false unless files.present?

      base_branch = FindOrCreateBranch.(repo_full_name, branch_name, token)
      base_commit_sha = base_branch.commit.sha
      base_tree_sha = base_branch.commit.commit.tree.sha

      new_tree = client.create_tree(repo_full_name, files, base_tree: base_tree_sha)

      # If the tree hasn't changed, we don't create the commit and return false
      # so that anything upstream can be aware
      return false if new_tree.sha == base_tree_sha

      new_commit = client.create_commit(repo_full_name, commit_message, new_tree.sha, base_commit_sha)
      client.update_ref(repo_full_name, "heads/#{branch_name}", new_commit.sha)

      # Let's keep this as always a boolean response.
      true
    end

    private
    delegate :repo_full_name, to: :syncer

    memoize
    def client = Octokit::Client.new(access_token: token)

    memoize
    def token
      @token || GithubApp.generate_installation_token!(syncer.installation_id)
    end
  end
end
