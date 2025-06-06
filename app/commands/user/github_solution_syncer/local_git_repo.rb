class User::GithubSolutionSyncer
  class LocalGitRepo
    extend Mandate::Memoize

    def initialize(syncer, base_branch_name, new_branch_name, token: nil)
      @syncer = syncer
      @base_branch_name = base_branch_name
      @new_branch_name = new_branch_name
      @token = token
    end

    def update
      return false if repo_too_big?

      Dir.mktmpdir do |dir|
        @path = dir

        clone_repo
        create_branch
        yield self if block_given?
        push_branch
      end

      true
    end

    def write_file(path, content)
      full_path = File.join(@path, path)
      FileUtils.mkdir_p(File.dirname(full_path))
      File.write(full_path, content)
    end

    def commit_all(message)
      return if `git -C #{@path} status --porcelain`.strip.empty?

      git("add", ".")
      git("commit", "-m", message)
    end

    def branch_name = @new_branch_name

    def base_branch_name
      client.branch(repo, @base_branch_name)
      @base_branch_name
    rescue Octokit::NotFound
      client.repository(repo).default_branch
    end

    private
    attr_reader :syncer, :new_branch_name

    def repo = syncer.repo_full_name

    def clone_repo
      # Manually do this as we don't want the working dir logic
      system("git", "clone", "--depth=1", repo_url, @path, exception: true)

      # Make sure we have the right user set
      git "config", "user.name", "Exercism's Solution Syncer Bot"
      git "config", "user.email", "211797793+exercism-solutions-syncer[bot]@users.noreply.github.com"

      begin
        git("checkout", base_branch_name)
      rescue RuntimeError
        git "checkout", "-b", base_branch_name
        git "commit", "--allow-empty", "-m", "Initial empty commit"
        git "push", "origin", base_branch_name
      end
    end

    def create_branch
      existing = `git -C #{@path} branch --list #{new_branch_name}`.strip
      if existing.empty?
        git("checkout", "-b", new_branch_name)
      else
        git("checkout", new_branch_name)
      end
    end

    def push_branch
      git("push", "--set-upstream", "origin", new_branch_name)
    end

    def git(*args)
      git_dir = File.join(@path, '.git')
      work_tree = @path
      system("git", "--git-dir=#{git_dir}", "--work-tree=#{work_tree}", *args, exception: true)
    end

    def repo_url
      "https://x-access-token:#{token}@github.com/#{repo}.git"
    end

    def token
      @token ||= GithubApp.generate_installation_token!(syncer.installation_id)
    end

    def repo_too_big?
      size_kb = Octokit::Client.new(access_token: token).repository(repo).size
      size_kb > 10_000 # 10MB
    end

    memoize
    def client
      Octokit::Client.new(access_token: token)
    end
  end
end
