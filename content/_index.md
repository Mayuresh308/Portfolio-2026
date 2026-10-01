---
# Leave the homepage title empty to use the site title
title: ''
summary: ''
# Browser tab / og:title for the homepage (other pages use "<Page> | <seo.title from params.yaml>")
seo:
  title: 'Mayuresh Devadkar | Portfolio'
date: 2022-10-24
type: landing

sections:
  - block: resume-biography-3
    content:
      # Choose a user profile to display (a folder name within `content/authors/`)
      username: me
      text: ''
      # Show a call-to-action button under your biography? (optional)
      button:
        text: Download CV
        url: uploads/resume.pdf
      headings:
        about: ''
        education: ''
        interests: ''
    design:
      # Use the new Gradient Mesh which automatically adapts to the selected theme colors
      background:
        gradient_mesh:
          enable: true

      # Name heading sizing to accommodate long or short names
      name:
        size: md # Options: xs, sm, md, lg (default), xl

      # Avatar customization
      avatar:
        size: medium # Options: small (150px), medium (200px, default), large (320px), xl (400px), xxl (500px)
        shape: circle # Options: circle (default), square, rounded

      # No section top padding: the block's inner wrapper already provides it (see assets/css/custom.css)
      spacing:
        padding: ['0', '0', 'var(--hb-spacing-section, 6rem)', '0']
  - block: markdown
    content:
      title: 'About'
      subtitle: ''
      text: |-
        I studied Mechanical Engineering, then moved into building software.
        As an Operations Associate, I own products end to end, from development and testing to UI/UX and debugging.
        Today I'm building AI products, including tools for meetings and speech-to-text.
        I'm looking for product and AI roles where I can take ideas from problem to shipped product.
    design:
      columns: '1'
  - block: collection
    id: projects
    content:
      title: Projects
      filters:
        folders:
          - projects
        featured_only: true
    design:
      view: article-grid
      columns: 2
      show_date: false
      show_read_time: false
---
