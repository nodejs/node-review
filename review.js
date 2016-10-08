'use strict'

;(function() {
  const STATUS = {
    APPROVED: 'APPROVED'
  , REJECTED: 'REJECTED'
  }

  const PR_RE = /\/nodejs\/([^\/]+)\/pull\/([^\/]+)\/?$/

  const prUrl = getPR()
  if (!prUrl) {
    return
  }

  const NOT_READY = 'This pull request is not yet ready to land.'
  const LGTM_RE = /(\W|^)lgtm(\W|$)/i

  const meta = getReviews()

  if (meta.rejections) {
    const rejs = []
    for (const [user, status] of meta.reviewers) {
      if (status === STATUS.REJECTED) {
        rejs.push(user)
      }
    }
    const rejString = rejs.map((rej) => {
      return `<li>${rej}</li>`
    }).join('\n')
    const str = `
      <p>
        <strong>Error: ${NOT_READY}</strong>
        <br>The following reviewers have requested changes:
        <br>
        <ul>
          ${rejString}
        </ul>
        <br>
      </p>
      `
    showMessage(str, 'error')
    return
  }

  if (!meta.approvals) {
    const str = `
      <p>
        <strong>Error: ${NOT_READY}</strong>
        <br>There are no approvals.
      </p>`
    showMessage(str, 'error')
    return
  }

  getCollaborators((err, collabs) => {
    if (err) {
      const str = `
      <p>
        <strong>Error: Something went wrong</strong>
        <br>Unable to load collaborators
      </p>`
      showMessage(str, 'error')
      console.error('Unable to load collaborators', err)
      return
    }

    const out = formatMeta(meta, collabs)
    showMessage(`<strong>PR Metadata</strong><br>${out}`)
  })

  function getPR() {
    const path = window.location.pathname
    const match = path.match(PR_RE)
    if (!match) return null
    return `https://github.com${path}`
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function formatMeta(meta, collabs) {
    const revs = []
    for (const name of meta.reviewers.keys()) {
      const c = collabs[name]
      if (!c) {
        console.error('skipping unknown reviewer', name)
        continue
      }
      revs.push(escapeHtml(`Reviewed-By: ${c.name} <${c.email}>`))
    }

    return `<br>
    <p>
      PR-URL: ${prUrl}
      <br><br>
      ${revs.join('<br>')}
      <br>
    </p>
    `
  }

  function getClassForType(type = 'info') {
    switch (type) {
      case 'error': return 'flash-error'
      case 'warn': return 'flash-warn'
      case 'info': return ''
    }
  }

  function getIconForType(type = 'info') {
    switch (type) {
      case 'error':
      case 'warn':
        return '<svg aria-hidden="true" class="flash-icon octicon octicon-alert" height="16" version="1.1" viewBox="0 0 16 16" width="16"><path d="M8.865 1.52c-.18-.31-.51-.5-.87-.5s-.69.19-.87.5L.275 13.5c-.18.31-.18.69 0 1 .19.31.52.5.87.5h13.7c.36 0 .69-.19.86-.5.17-.31.18-.69.01-1L8.865 1.52zM8.995 13h-2v-2h2v2zm0-3h-2V6h2v4z"></path></svg>'
      default:
        return ''
    }
  }

  function showMessage(str, type = 'info') {
    // Somewhat lifted from
    // https://github.com/OctoLinker/browser-extension/blob/master/lib/gh-interface.js
    const klass = getClassForType(type)
    const div = document.createElement('DIV')
    div.classList = 'flash flash-full flash-with-icon'
    if (klass) div.classList.add(klass)
    const icon = getIconForType(type)
    div.innerHTML = `
    <div class="container">
      ${icon}
      <button class="flash-close js-flash-close" type="button" aria_label="Dismiss this message">
        <svg aria-hidden="true" class="octicon octicon-x" height="16" version="1.1" viewBox="0 0 12 16" width="12"><path d="M7.48 8l3.75 3.75-1.48 1.48L6 9.48l-3.75 3.75-1.48-1.48L4.52 8 .77 4.25l1.48-1.48L6 6.52l3.75-3.75 1.48 1.48z"></path></svg>
      </button>
      ${str}
    </div>`

    const container = document.querySelector('#js-flash-container')
    container.appendChild(div)
    container.scrollIntoViewIfNeeded()
  }

  function getReviews() {
    const sel = '.merge-status-list .merge-status-item .merge-status-details'
    const ICONS = {
      APPROVED: 'text-green'
    , REJECTED: 'text-red'
    }

    const items = document.querySelectorAll(sel)
    const filtered = Array.from(items).filter(item => item.text !== 'Details')
    const meta = {
      approvals: 0
    , rejections: 0
    , reviewers: new Map()
    }

    for (const item of filtered) {
      const parent = item.parentNode
      const icon = parent.querySelector('.merge-status-icon')
      const svg = icon.querySelector('svg')
      const status = svg.classList.contains(ICONS.APPROVED)
        ? STATUS.APPROVED
        : STATUS.REJECTED
      const reviewerA = parent.querySelector('a:not(.merge-status-details)')
      const href = reviewerA.getAttribute('href')
      const reviewerUsername = href.slice(1)
      if (status === STATUS.APPROVED) {
        meta.approvals++
      } else if (status === STATUS.REJECTED) {
        meta.rejections++
      }

      meta.reviewers.set(reviewerUsername.toLowerCase(), status)
    }

    const raw = getRawReviews()
    if (raw.length) {
      for (const login of raw) {
        if (!meta.reviewers.has(login)) {
          meta.reviewers.set(login, STATUS.APPROVED)
          meta.approvals++
        }
      }
    }

    return meta
  }

  function getRawReviews() {
    const items = document.querySelectorAll('.timeline-comment-wrapper')
    const filtered = Array.from(items).filter((item) => {
      return !item.classList.contains('discussion-item-review')
    })

    const revs = []
    const tl = '.timeline-comment-header .timeline-comment-header-text strong a'

    for (const item of filtered) {
      const comment = item.querySelector('.comment')
      const a = comment.querySelector(tl)
      if (!a) continue
      const href = a.getAttribute('href')
      if (!href) continue
      const login = href.slice(1).toLowerCase()
      const body = comment.querySelector('.comment-body')
      if (body && LGTM_RE.test(body.innerHTML)) {
        revs.push(login)
      }
    }

    return revs
  }

  function getCollaborators(cb) {
    // This is more or less taken from
    // https://github.com/rvagg/iojs-tools/blob/master/pr-metadata/pr-metadata.js
    const RE = '\\* \\[([^\\]]+)\\]\\([^\\)]+\\) -\\s\\*\\*([^\\*]+)\\*\\* ' +
      '&lt;([^&]+)&gt;'
    const url = 'https://raw.githubusercontent.com/nodejs/node/master/README.md'
    fetch(url)
      .then((res) => res.text())
      .then((body) => {
        const collabs = body.match(new RegExp(RE, 'mg'))
        if (!collabs) {
          const err = new Error('Could not parse collaborators')
          return cb(err)
        }

        const members = collabs.reduce((set, item) => {
          const m = item.match(new RegExp(RE))
          set[m[1].toLowerCase()] = {
            login: m[1]
          , name: m[2]
          , email: m[3]
          }

          return set
        }, {})

        if (!Object.keys(members).length) {
          throw new Error('Could not find any collaborators')
        }

        return members
      })
      .then((members) => {
        cb(null, members)
      })
      .catch(cb)
  }
})();
