'use strict';

require('dotenv').config({ silent: true });

let app = require('express')();

require('./server/middleware')(app);

app.listen(process.env.PORT);
