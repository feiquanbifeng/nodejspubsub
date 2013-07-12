
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , redis = require('redis')
//  , connect = require('connect')
  , amqp = require('amqp')
  , path = require('path');

var rabbitConn = amqp.createConnection({});
var chatExchange;

rabbitConn.on('ready', function() {
    chatExchange = rabbitConn.exchange('chatExchange', {'type': 'fanout'});
});

var app = express();

var RedisStore = require('connect-redis')(express),
    rClient = redis.createClient(),
    sessionStore = new RedisStore({client: rClient});


var cookieParser = express.cookieParser('jetsen');
// var sessionStore = new connect.middleware.session.MemoryStore();

var server = http.createServer(app);
var io = require('socket.io').listen(server);

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());

app.use(cookieParser);
app.use(express.session({
          store: sessionStore
          })
        );

app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
// app.get('/users', user.list);
app.get('/users', function(req, res) {
  req.session.user = req.body.user;
  res.json({'error': ''});
});

var SessionSockets = require('session.socket.io');
var sessionSockets = new SessionSockets(io, sessionStore, cookieParser);

sessionSockets.on('connection', function(err, socket, session) {
    socket.on('chat', function(data) {
       var msg = JSON.parse(data);
       var reply = JSON.stringify({
                                  action: 'message',
                                  user: msg.user,
                                  msg: msg.msg}
                                 );
        chatExchange.publish('', reply);
     });

     socket.on('join', function() {
       var reply = JSON.stringify({
                                   action: 'control',
                                   user: session.user,
                                   msg: 'joined the channel'
                                  });
        console.log('*************' + reply);
        chatExchange.publish('', reply) ;

     });

     rabbitConn.queue('', {exclusive: true}, function(q){
     q.bind('chatExchange', '#');
     q.subscribe(function(message) {
        console.log('Message received (' + 1 + '): ' + message.data);
        console.log('======' + JSON.parse(message.data) + '========');
        socket.emit('chat', JSON.parse(message.data));
     });   
  });
});


// set xhr-polling as websocket is not supported by CF
io.set('transports', ['websocket', 'xhr-polling']);
// io.set('polling duration', 10);
// io.set('contentType', 'application/text');
// set socket.io's log level to 1 (info). default is 3 (debug)
// io.set('log level', 1);

server.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
