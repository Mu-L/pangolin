<div align="center">
    <h2>
    <a href="https://pangolin.net/">
        <picture>
            <source media="(prefers-color-scheme: dark)" srcset="public/logo/word_mark_white.png">
            <img alt="Pangolin Logo" src="public/logo/word_mark_black.png" width="350">
        </picture>
    </a>
    </h2>
</div>

<div align="center">
  <h5>
      <a href="https://pangolin.net/">
        Website
      </a>
      <span> | </span>
      <a href="https://docs.pangolin.net/">
        Documentation
      </a>
      <span> | </span>
      <a href="mailto:contact@pangolin.net">
        Contact Us
      </a>
  </h5>
</div>

<div align="center">

[![Discord](https://img.shields.io/discord/1325658630518865980?logo=discord&style=flat-square)](https://discord.gg/HCJR8Xhme4)
[![Slack](https://img.shields.io/badge/chat-slack-yellow?style=flat-square&logo=slack)](https://pangolin.net/slack)
[![Docker](https://img.shields.io/docker/pulls/fosrl/pangolin?style=flat-square)](https://hub.docker.com/r/fosrl/pangolin)
![Stars](https://img.shields.io/github/stars/fosrl/pangolin?style=flat-square)
[![YouTube](https://img.shields.io/badge/YouTube-red?logo=youtube&logoColor=white&style=flat-square)](https://www.youtube.com/@pangolin-net)

</div>

<p align="center">
    <strong>
        Start testing Pangolin at <a href="https://app.pangolin.net/auth/signup">app.pangolin.net</a>
    </strong>
</p>

Pangolin is an open-source, identity-based remote access platform built on WireGuard that enables secure, seamless connectivity to private and public resources. Pangolin combines reverse proxy and VPN capabilities into one platform, providing browser-based access to web applications and client-based access to any private resources, all with zero-trust security and granular access control.

## Installation

- Check out the [quick install guide](https://docs.pangolin.net/self-host/quick-install) for how to install and set up Pangolin.
- Install from the [DigitalOcean marketplace](https://marketplace.digitalocean.com/apps/pangolin-ce-1?refcode=edf0480eeb81) for a one-click pre-configured installer.

<img src="public/screenshots/hero.png" />

## Deployment Options

| <img width=500 /> | Description |
|-----------------|--------------|
| **Self-Host: Community Edition** | Free, open source, and licensed under AGPL-3. |
| **Self-Host: Enterprise Edition** | Licensed under Fossorial Commercial License. Free for personal and hobbyist use, and for businesses earning under \$100K USD annually. |
| **Pangolin Cloud** | Fully managed service with instant setup and pay-as-you-go pricing — no infrastructure required. Or, self-host your own [remote node](https://docs.pangolin.net/manage/remote-node/nodes) and connect to our control plane. |

## Key Features

| <img width=500 />                                                                                                                                                                                                                                                                                                                                                                | <img width=500 />                                                  |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| **Connect remote networks with sites**<br /><br />Pangolin's lightweight site connectors create secure tunnels from remote networks without requiring public IP addresses or open ports. Sites make any network anywhere available for authorized access.                                                                                                                                                                                   | <img src="public/screenshots/sites.png" width=500 /><tr></tr>               |
| **Browser-based reverse proxy access**<br /><br />Expose web applications through identity and context-aware tunneled reverse proxies. Pangolin handles routing, load balancing, health checking, and automatic SSL certificates without exposing your network directly to the internet. Users access applications through any web browser with authentication and granular access control.                                                                                                  | <img src="public/clip.gif" width=500 /><tr></tr>          |
| **Client-based private resource access**<br /><br />Access private resources like SSH servers, databases, RDP, and entire network ranges through Pangolin clients. Intelligent NAT traversal enables connections even through restrictive firewalls, while DNS aliases provide friendly names and fast connections to resources across all your sites.                                                                                                                                                                                                | <img src="public/screenshots/private-resources.png" width=500 /><tr></tr>               |
| **Zero-trust granular access**<br /><br />Grant users access to specific resources, not entire networks. Unlike traditional VPNs that expose full network access, Pangolin's zero-trust model ensures users can only reach the applications and services you explicitly define, reducing security risk and attack surface.                                                                                                                                                                                    | <img src="public/screenshots/user-devices.png" width=500 /><tr></tr> |

## Download Clients

Download the Pangolin client for your platform:

- [Mac](https://pangolin.net/downloads/mac)
- [Windows](https://pangolin.net/downloads/windows)
- [Linux](https://pangolin.net/downloads/linux)

## Get Started

### Check out the docs

We encourage everyone to read the full documentation first, which is
available at [docs.pangolin.net](https://docs.pangolin.net). This README provides only a very brief subset of
the docs to illustrate some basic ideas.

### Sign up and try now

For Pangolin's managed service, you will first need to create an account at
[app.pangolin.net](https://app.pangolin.net). We have a generous free tier to get started.

## Licensing

Pangolin is dual licensed under the AGPL-3 and the [Fossorial Commercial License](https://pangolin.net/fcl.html). For inquiries about commercial licensing, please contact us at [contact@pangolin.net](mailto:contact@pangolin.net).

## Contributions

Please see [CONTRIBUTING](./CONTRIBUTING.md) in the repository for guidelines and best practices.

---

WireGuard® is a registered trademark of Jason A. Donenfeld.
