# Parity's Cloudflare services, from the shared modules: the Worker each pull request's Storybook is a preview of
# (PAR-113) and the Workers Parity's service runs in (PAR-947), with the tokens that deploy them and the settings the
# workflows read. The terraform-apply workflow runs it with its state in R2, beside infra/github's.
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

# The zone the service's API is served on. Its ID is looked up by name, so it's written nowhere.
data "cloudflare_zone" "tryparity" {
  filter = {
    name = "tryparity.dev"
  }
}

# Parity's service, apps/portal (PAR-947, docs/proposals/service.md): a Worker for staging and one for production, the
# token that deploys them, and the settings cd-portal.yml's and preview.yml's web templates read. Production is served
# at api.tryparity.dev only. A pull request's preview is a preview of staging's Worker.
module "portal" {
  source = "git::https://github.com/betterapps-hq/pipelines.git//terraform/cloudflare-web?ref=main"

  account_id  = "544b5bfd594cd02a5da4b79a2038cc9f"
  repository  = "parity"
  name_prefix = "parity-portal"

  environments = {
    # Nothing else uses staging, so the module makes and owns it.
    staging = { manage_environment = true }
    # production exists already, so the module only writes its WEB_ settings into it.
    production = {
      custom_domain = {
        zone_id  = data.cloudflare_zone.tryparity.zone_id
        hostname = "api.tryparity.dev"
      }
      workers_dev  = false
      preview_urls = false
    }
  }

  # The Storybook module owns the preview environment and writes its account ID, so this one only adds to it.
  previews = {
    manage_environment = false
    write_account_id   = false
  }

  # A deploy makes the KV namespace searches are kept in, from its binding, so the token can write KV too (PAR-131).
  token_permissions = ["Workers Scripts Write", "Workers KV Storage Write"]
}

# The portal's pages are served at tryparity.dev by the same production Worker (PAR-1003). The module takes one custom
# domain for an environment, the API's, so this second one is attached here. Both hosts reach every route for now.
resource "cloudflare_workers_custom_domain" "portal_pages" {
  account_id = "544b5bfd594cd02a5da4b79a2038cc9f"
  zone_id    = data.cloudflare_zone.tryparity.zone_id
  hostname   = "tryparity.dev"
  service    = module.portal.environments["production"].worker
}

output "portal" {
  value = module.portal.environments
}
