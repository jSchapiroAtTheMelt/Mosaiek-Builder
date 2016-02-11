'use strict';

require('dotenv').config({ silent: true });

let expect = require('chai').expect;
let request = require('supertest');
request = request(process.env.HOST + ':' + process.env.PORT);

describe('Hook endpoints', () => {

  it('should have a default hook uri', done => {
    request
      .get('/hook')
      .expect('Content-Type', /json/)
      .end((error, res) => {
        if (error) {
          return done(error);
        }
        expect(res.status).to.equal(200);
        expect(res.body.error).to.exist;
        done();
      });
  });

});
