# Parity's Cloudflare services, from the shared modules: the Worker each pull request's Storybook is a preview of
# (PAR-113), the token that deploys it, and the preview environment's settings that preview.yml's publish-storybook and
# preview-cleanup.yml's unpublish-storybook read. The terraform-apply workflow runs it with its state in R2, beside
# infra/github's.
terraform {
  required_version = "= 1.16.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "5.28.0"
    }
    github = {
      source  = "integrations/github"
      version = "6.13.0"
    }
  }
  # The bucket and R2 endpoint are given to terraform init; the state key is fixed here.
  backend "s3" {
    key                         = "parity/cloudflare/terraform.tfstate"
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

# CLOUDFLARE_API_TOKEN and GITHUB_TOKEN come from the environment.
provider "cloudflare" {}

provider "github" {
  owner = "betterapps-hq"
}

# Only previews for now: Parity has no staging or production Storybook. The module owns the preview environment, which
# nothing else uses. Its Worker is parity-storybook-preview, so a pull request's Storybook is at
# https://pr-<number>-parity-storybook-preview.<subdomain>.workers.dev.
module "storybook" {
  source = "git::https://github.com/betterapps-hq/pipelines.git//terraform/cloudflare-storybook?ref=main"

  account_id  = "544b5bfd594cd02a5da4b79a2038cc9f"
  repository  = "parity"
  name_prefix = "parity"

  environments = {
    preview = { manage_environment = true }
  }
}

output "storybook" {
  value = module.storybook.environments
}
