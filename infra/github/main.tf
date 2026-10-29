# Parity's repository rules on GitHub, from the shared github-repository-rules module: main takes changes only through
# squashed pull requests that pass CI and CodeRabbit with every thread resolved, and release tags never move. The
# terraform-apply workflow runs it with its state in R2, as Copacker's projects run.
terraform {
  required_version = "= 1.16.6"
  required_providers {
    github = {
      source  = "integrations/github"
      version = "6.13.0"
    }
  }
  # The bucket and R2 endpoint are given to terraform init; the state key is fixed here.
  backend "s3" {
    key                         = "parity/github/terraform.tfstate"
    region                      = "auto"
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}

# GITHUB_TOKEN comes from the environment.
provider "github" {
  owner = "betterapps-hq"
}

module "rules" {
  source = "git::https://github.com/betterapps-hq/pipelines.git//terraform/github-repository-rules?ref=c3b85f070cf22fbf7a4dae841461f82e2b16ea20" # v1.2.0

  repository      = "parity"
  required_checks = ["CI passes", "CodeRabbit"]
}

# The rulesets were made by hand on 2026-10-29, to match this module, so main was protected before Terraform ran here.
# These adopt them, with no changes, and can go once they're applied.
import {
  to = module.rules.github_repository_ruleset.default_branch
  id = "parity:26170706"
}

import {
  to = module.rules.github_repository_ruleset.release_tags[0]
  id = "parity:26170708"
}
