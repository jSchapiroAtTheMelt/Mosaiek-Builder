'use strict';

require('dotenv').config({ silent: true });

let app = require('express')();

app.use('/hooks', ParseCloud.app);

require('./server/middleware')(app);

app.listen(process.env.PORT);
