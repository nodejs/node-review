/* global browser */

'use strict'

if (typeof browser !== 'undefined') {
  var chrome = browser
}

;(function () {
  const STATUS = {
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED'
  }

  const PR_RE = /^\/nodejs\/([^/]+)\/pull\/([^/]+)\/?$/

  const { prUrl, repo } = getPR()
  if (!prUrl) {
    return
  }

  const NOT_READY = 'This pull request is not yet ready to land.'
  const LGTM_RE = /(\W|^)lgtm(\W|$)/i
  const FIXES_RE = /Fixes: (.*)/mg
  const FIX_RE = /Fixes: (.*)/
  const REFS_RE = /Refs?: (.*)/mg
  const REF_RE = /Refs?: (.*)/
  const APPROVAL_RE = /(.*) approved these changes/
  const REJECTED_RE = /(.*) requested changes/
  const DISMISSED_RE = /(.*) dismissed/
  const REFERENCE_RE = /referenced this pull request in/
  const LOGIN_RE = / .*/

  class Metadata {
    constructor () {
      this.approvals = 0
      this.rejections = 0
      this.reviewers = new Map()
    }

    addApproval (login) {
      login = login.replace(LOGIN_RE, '')
      if (!this.reviewers.has(login)) {
        this.approvals += 1
        this.reviewers.set(login, STATUS.APPROVED)
        return
      }
      const status = this.reviewers.get(login)
      if (status === STATUS.APPROVED) return
      this.rejections -= 1
      this.approvals += 1
      this.reviewers.set(login, STATUS.APPROVED)
    }

    addRejection (login) {
      login = login.replace(LOGIN_RE, '')
      if (!this.reviewers.has(login)) {
        this.rejections += 1
        this.reviewers.set(login, STATUS.REJECTED)
        return
      }
      const status = this.reviewers.get(login)
      if (status === STATUS.REJECTED) return
      this.approvals -= 1
      this.rejections += 1
      this.reviewers.set(login, STATUS.REJECTED)
    }

    addDismissal(login) {
      login = login.replace(LOGIN_RE, '')
      const status = this.reviewers.get(login)
      if (status === STATUS.REJECTED) this.rejections -= 1
      else if (status === STATUS.APPROVED) this.approvals -= 1
      this.reviewers.delete(login)
    }

  }

  const m = new Metadata()
  const meta = getReviews(m)

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

  const OP = document.querySelector('.pull-discussion-timeline .comment-body')

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
    showMessage(`
      <h3>PR Metadata</h3>
      <div style="margin-top:0.5em">
        <div>
          <div style="float:right">
            <div class="BtnGroup">
              <button aria-label="Copy the PR metadata" class="js-zeroclipboard btn btn-outline BtnGroup-item zeroclipboard-button tooltipped tooltipped-s" data-clipboard-text="${out}" data-copied-hint="Copied!" type="button">
                <svg aria-hidden="true" class="octicon octicon-clippy" height="16" version="1.1" viewBox="0 0 14 16" width="14">
                  <path fill-rule="evenodd" d="M2 13h4v1H2v-1zm5-6H2v1h5V7zm2 3V8l-3 3 3 3v-2h5v-2H9zM4.5 9H2v1h2.5V9zM2 12h2.5v-1H2v1zm9 1h1v2c-.02.28-.11.52-.3.7-.19.18-.42.28-.7.3H1c-.55 0-1-.45-1-1V4c0-.55.45-1 1-1h3c0-1.11.89-2 2-2 1.11 0 2 .89 2 2h3c.55 0 1 .45 1 1v5h-1V6H1v9h10v-2zM2 5h8c0-.55-.45-1-1-1H8c-.55 0-1-.45-1-1s-.45-1-1-1-1 .45-1 1-.45 1-1 1H3c-.55 0-1 .45-1 1z"></path>
                </svg>
              </button>
            </div>
          </div>
          <div>
            <pre>${out}</pre>
          </div>
        </div>
      </div>`)
  })

  function getPR () {
    const path = window.location.pathname
    const match = path.match(PR_RE)
    if (!match) return { prUrl: null, repo: null }
    return {
      prUrl: `https://github.com${path}`,
      repo: `nodejs/${match[1]}`
    }
  }

  function getFixesUrlsFromArray (ar) {
    return ar.reduce((set, item) => {
      const m = item.match(FIX_RE)
      if (!m) return set
      const fix = m[1]
      const url = fix.replace(/^#/, `${repo}#`).replace('#', '/issues/')
      set.push(`https://github.com/${url}`)
      return set
    }, [])
  }

  function getRefsUrlsFromArray (ar) {
    return ar.reduce((set, item) => {
      const m = item.match(REF_RE)
      if (!m) return set
      const ref = m[1]
      const url = getRefUrlFromOP(ref)
      if (url) set.push(url)
      return set
    }, [])
  }

  // Do this so we can reliably get the correct url.
  // Otherwise, the number could reference a PR or an issue.
  function getRefUrlFromOP (ref) {
    const as = OP.querySelectorAll('a')
    const links = Array.from(as)
    for (const link of links) {
      const text = link.innerText
      if (text === ref) {
        const href = link.getAttribute('href')
        if (href) return href
      }
    }
  }

  function getRefsAndFixes () {
    const text = OP.innerText

    const out = {
      fixes: [],
      refs: []
    }

    var fixes = text.match(FIXES_RE)
    if (fixes) {
      out.fixes = getFixesUrlsFromArray(fixes)
    }

    var refs = text.match(REFS_RE)
    if (refs) {
      out.refs = getRefsUrlsFromArray(refs)
    }

    return out
  }

  function escapeHtml (str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function formatMeta (meta, collabs) {
    const revs = []
    for (const name of meta.reviewers.keys()) {
      const c = collabs.get(name)
      if (!c) {
        console.error('skipping unknown reviewer', name)
        continue
      }
      revs.push(escapeHtml(`Reviewed-By: ${c.name} <${c.email}>`))
    }

    const { refs, fixes } = getRefsAndFixes()

    const result = [`PR-URL: ${prUrl}`]

    if (fixes && fixes.length) {
      fixes.forEach((fix) => {
        result.push(`Fixes: ${fix}`)
      })
    }

    if (refs && refs.length) {
      refs.forEach((ref) => {
        result.push(`Refs: ${ref}`)
      })
    }

    return result.join('\n') + '\n' + revs.join('\n')
  }

  function getClassForType (type = 'info') {
    switch (type) {
      case 'error': return 'flash-error'
      case 'warn': return 'flash-warn'
      case 'info': return ''
    }
  }

  function getIconForType (type = 'info') {
    switch (type) {
      case 'error':
      case 'warn':
        return '<svg aria-hidden="true" class="flash-icon octicon octicon-alert" height="16" version="1.1" viewBox="0 0 16 16" width="16"><path d="M8.865 1.52c-.18-.31-.51-.5-.87-.5s-.69.19-.87.5L.275 13.5c-.18.31-.18.69 0 1 .19.31.52.5.87.5h13.7c.36 0 .69-.19.86-.5.17-.31.18-.69.01-1L8.865 1.52zM8.995 13h-2v-2h2v2zm0-3h-2V6h2v4z"></path></svg>'
      default:
        return ''
    }
  }

  function showMessage (str, type = 'info') {
    // Somewhat lifted from
    // https://github.com/OctoLinker/browser-extension/blob/master/lib/gh-interface.js
    const klass = getClassForType(type)
    const div = document.createElement('DIV')
    div.classList.add('flash')
    div.classList.add('flash-full')
    div.classList.add('flash-with-icon')
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
    container.scrollIntoView(false)
  }

  function getReviewsWithoutDetails (meta) {
    const items = Array.from(document.querySelectorAll('.discussion-item'))

    if (!items.length) return meta

    for (const item of items) {
      const text = item.innerText

      if (text.match(REFERENCE_RE)) {
        continue;
      }

      const approval = text.match(APPROVAL_RE)
      if (approval) {
        const login = approval[1].toLowerCase()
        meta.addApproval(login)
        continue
      }

      const rejection = text.match(REJECTED_RE)
      if (rejection) {
        const login = rejection[1].toLowerCase()
        meta.addRejection(login)
        continue
      }

      const dismissal = text.match(DISMISSED_RE)
      if (dismissal) {
        const authors = item.querySelectorAll('a.author');
        const authorA = authors.length === 2 ? authors[1] : authors[0];
        if (!authorA) continue;
        const login = authorA.innerText.toLowerCase();
        meta.addDismissal(login)
        continue
      }
    }

    const raw = getRawReviews()
    if (raw.length) {
      for (const login of raw) {
        meta.addApproval(login)
      }
    }

    return meta
  }

  function getReviews (meta) {
    const sel = '.merge-status-list .review-item .review-status-item'
    const ICONS = {
      APPROVED: 'octicon-check',
      REJECTED: 'octicon-file-diff'
    }

    const items = document.querySelectorAll(sel)
    const filtered = Array.from(items).filter(item => item.text !== 'Details')

    if (!filtered.length) return getReviewsWithoutDetails(meta)

    for (const item of filtered) {
      const parent = item.closest('details')
      const icon = parent.querySelector('.merge-status-icon')
      const svg = icon.querySelector('svg')
      const status = svg.classList.contains(ICONS.APPROVED)
        ? STATUS.APPROVED
        : STATUS.REJECTED
      const reviewerA = item.querySelector('a:not(.merge-status-details)')
      const href = reviewerA.getAttribute('href')
      const reviewerUsername = href.slice(1)
      const login = reviewerUsername.toLowerCase()
      if (status === STATUS.APPROVED) {
        meta.addApproval(login)
      } else if (status === STATUS.REJECTED) {
        meta.addRejection(login)
      }
    }

    const raw = getRawReviews()
    if (raw.length) {
      for (const login of raw) {
        meta.addApproval(login)
      }
    }

    return meta
  }

  function getRawReviews () {
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
      const paragraphs = comment.querySelectorAll('.comment-body > p')
      if (Array.from(paragraphs).some(p => LGTM_RE.test(p.innerHTML))) {
        revs.push(login)
      }
    }

    return revs
  }

  function getCollaborators (cb) {
    // This is more or less taken from
    // https://github.com/rvagg/iojs-tools/blob/master/pr-metadata/pr-metadata.js
    const RE = /\* \[(.+?)\]\(.+?\) -\s\*\*(.+?)\*\* &lt;(.+?)&gt;/mg
    const url = 'https://raw.githubusercontent.com/nodejs/node/master/README.md'

    chrome.runtime.sendMessage(
      {url: url},
      function (response) {
        if (response && response.error) {
          cb(response.error)
        } else if (response && response.body) {
          const members = new Map()
          let m

          while (m = RE.exec(response.body)) { // eslint-disable-line no-cond-assign
            members.set(m[1].toLowerCase(), {
              login: m[1],
              name: m[2],
              email: m[3]
            })
          }

          if (!members.size) {
            throw new Error('Could not find any collaborators')
          }

          cb(null, members)
        } else {
          cb('No response received')
        }
      })
  }
})()
