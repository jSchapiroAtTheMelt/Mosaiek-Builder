'use strict';
let bodyParser = require('body-parser');
let morgan = require('morgan');
let ParseCloud = require('parse-cloud-express');
let Parse = ParseCloud.Parse;

module.exports = (app) => {
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(bodyParser.json());
  app.use(morgan('dev'));
  app.use(/\/hooks?/, ParseCloud.app);
};

//TODO: http://blog.parse.com/learn/using-node-js-with-parse/
app.post('/hooks/mosaiek/contribute',(req,res) => {
  console.log(req.body);
});

Parse.Cloud.define('/mosaiek/contribute', (req, res) => {
  console.log(req.body);
  res.json(req.body);
});

// Parse.Cloud.define('findBacon', (req, res) => {
//   let token = req.user.getSessionToken();
//   let query = new Parse.Query('Bacon');
//   // Pass the session token to the query
//   query.find({ sessionToken: token }).then((error, result) => {
//     if (error) {
//       return res.json(error);
//     }
//     res.json(result);
//   });
// });
