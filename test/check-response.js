const { Readable } = require('stream')
const t = require('tap')

const checkResponse = require('../check-response.js')
const errors = require('../errors.js')
const silentLog = require('../silentlog.js')
const registry = 'registry'
const startTime = Date.now()

class Body extends Readable {
  _read () {
    return ''
  }
}
class Headers {
  has () {}
  get () {}
  raw () {}
}
const mockFetchRes = {
  body: new Body(),
  buffer: () => Promise.resolve(),
  headers: new Headers(),
  status: 200,
}

t.test('any response error should be silent', t => {
  const res = Object.assign({}, mockFetchRes, {
    buffer: () => Promise.reject(new Error('ERR')),
    status: 400,
  })
  t.rejects(checkResponse('get', res, 'registry', Date.now(), { ignoreBody: true }), errors.HttpErrorGeneral)
  t.end()
})

t.test('all checks are ok, nothing to report', t => {
  const res = Object.assign({}, mockFetchRes, {
    buffer: () => Promise.resolve(Buffer.from('ok')),
    status: 400,
  })
  t.rejects(checkResponse('get', res, 'registry', Date.now()), errors.HttpErrorGeneral)
  t.end()
})

t.test('log x-fetch-attempts header value', t => {
  const headers = new Headers()
  headers.get = header => header === 'x-fetch-attempts' ? 3 : undefined
  const res = Object.assign({}, mockFetchRes, {
    headers,
    status: 400,
  })
  t.plan(2)
  t.rejects(checkResponse('get', res, 'registry', Date.now(), {
    log: Object.assign({}, silentLog, {
      http (header, msg) {
        t.ok(msg.endsWith('attempt #3'), 'should log correct number of attempts')
      },
    }),
  }))
})

t.test('log the url fetched', t => {
  const headers = new Headers()
  const EE = require('events')
  headers.get = header => undefined
  const res = Object.assign({}, mockFetchRes, {
    headers,
    status: 200,
    url: 'http://example.com/foo/bar/baz',
    body: new EE(),
  })
  t.plan(2)
  checkResponse('get', res, 'registry', Date.now(), {
    log: Object.assign({}, silentLog, {
      http (header, msg) {
        t.equal(header, 'fetch')
        t.match(msg, /^GET 200 http:\/\/example.com\/foo\/bar\/baz [0-9]+m?s/)
      },
    }),
  })
  res.body.emit('end')
})

t.test('redact password from log', t => {
  const headers = new Headers()
  const EE = require('events')
  headers.get = header => undefined
  const res = Object.assign({}, mockFetchRes, {
    headers,
    status: 200,
    url: 'http://username:password@example.com/foo/bar/baz',
    body: new EE(),
  })
  t.plan(2)
  checkResponse('get', res, 'registry', Date.now(), {
    log: Object.assign({}, silentLog, {
      http (header, msg) {
        t.equal(header, 'fetch')
        t.match(msg, /^GET 200 http:\/\/username:\*\*\*@example.com\/foo\/bar\/baz [0-9]+m?s/)
      },
    }),
  })
  res.body.emit('end')
})

t.test('bad-formatted warning headers', t => {
  const headers = new Headers()
  headers.has = header => header === 'warning' ? 'foo' : undefined
  headers.raw = () => ({
    warning: ['100 - foo'],
  })
  const res = Object.assign({}, mockFetchRes, {
    headers,
  })
  t.ok(checkResponse('get', res, 'registry', Date.now(), {
    log: Object.assign({}, silentLog, {
      warn (header, msg) {
        t.fail('should not log warnings')
      },
    }),
  }))
  t.plan(1)
})
