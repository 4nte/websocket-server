import http from 'http';
import sockjs from 'sockjs';
import redis from 'redis';
import node_static from 'node-static';
import jwt from 'jsonwebtoken';
import config from './config';

// Redis publisher
const redisOptions = {...config.redis}
var redisClient = redis.createClient(redisOptions);
var redisSubscriber = redis.createClient(redisOptions);

// Sockjs server
var sockjs_opts = {sockjs_url: "http://cdn.sockjs.org/sockjs-0.3.min.js"};
var socket = sockjs.createServer(sockjs_opts);

const connections = {};

redisSubscriber.subscribe('events');
redisSubscriber.on("message", function(channel, event){

    console.log(channel, '--(event)-->', event);

    event = JSON.parse(event);
    const eventPayload = JSON.stringify(event.payload);

    
 
      for(let conn in connections){
      conn = connections[conn];
      redisClient.SMEMBERS('connection/'+conn.id+'/subscriptions', (err, subscriptions)=>{
        console.log('user subsriptions', subscriptions);
        console.log('event address', event.address);


          let intersectedTags = [];
          if(event.address.tags.length > 0 && subscriptions.length > 0){         
            for(let tag in subscriptions){
              tag = subscriptions[tag];

              for(let _tag in event.address.tags){
                _tag = event.address.tags[_tag];

                console.log(tag, '=?=', _tag);
                if(tag == _tag)
                  intersectedTags.push(tag);

              }
            }
          }

          let exclusive = false;
          for(let userId in event.address.include){
            userId = event.address.include[userId];
            if(userId == conn.userId){
              exclusive = true;
              break;
            }
          }

          // Send to browser if any addresses interescted

          if(intersectedTags.length > 0 || exclusive){

            //Check if excluded
            if(event.address.exclude){
              for(let exclude in event.address.exclude){
                exclude = event.address.exclude[exclude];
                if(exclude == conn.userId)
                  return;
              }
              const browserEvent = {tags: intersectedTags, notification: eventPayload, exclusive};
              console.log('[Pushing to browser] ', browserEvent);
              conn.write(JSON.stringify(browserEvent));
            }
          }
      });
    }
});

socket.on('connection', function(conn) {
  if(conn === null){
    console.log('Connection is NULL!');
    return;
  }

  let userId;
  // Save connection
  connections[conn.id] = conn;
  conn.userId = null;

	const connectionInfo = {
		remoteAddress: conn.remoteAddress,
		address: conn.address,
		headers: conn.headers
	}

	conn.on('data', function(data) {
		const {type, payload} = JSON.parse(data);
      if(!type || !payload)
        return console.log('Type or channel information is missing, Returning!');


    // User attempts to authorise
    if(type == 'authorisation'){
      console.log('authorisation');
      jwt.verify(payload, config.secret, function(err, decoded) {
        if(err){
        	return console.log('failed to verify JWT');
        }
        userId = decoded.sub;
        conn.userId = decoded.sub;
        console.log('successfully decoded JWT. Userid:',userId);
        redisClient.SADD('user/'+userId+'/connections', conn.id );
			});
    }

    // User subscribes to an query
    if(type == 'subscribe'){
      console.log('[Subscribe]', payload);
      redisClient.SADD('connection/'+conn.id+'/subscriptions', payload);
    }

    // User cancels subscription
    if(type == 'unsubscribe'){
      console.log('[Un-Subscribe]', payload);
      redisClient.SREM('connection/'+conn.id+'/subscriptions', payload);
    }
  });

  conn.on('close', function() {
    console.log('[Connection Closed]');

      // Remove connection session from user's session list
      if(userId){
      	redisClient.SREM('user/'+userId+'/connections', conn.id);
      	console.log('> Removed user connection.');
      }

      // Remove subscriptions made via this connection
      redisClient.DEL('connection/'+conn.id+'/subscriptions');
      console.log('> Removed subscriptions of this connection.');

      // Remove connection from app memory
      delete connections[conn.id];
    });
});





// 2. Static files server
var static_directory = new node_static.Server(__dirname);

// 3. Usual http stuff
var server = http.createServer();
server.addListener('request', function(req, res) {
    static_directory.serve(req, res);
});
server.addListener('upgrade', function(req,res){
    res.end();
});

socket.installHandlers(server, {prefix:'/socket'});

console.log(' [*] Websocket server is Listening on 0.0.0.0:8500' );
server.listen(config.port, config.host);