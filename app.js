
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , conf = require('./conf')
  , app = express()
  , server = http.createServer(app)
  , mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , ObjectId = mongoose.SchemaTypes.ObjectId
  , passport = require('passport')
  , FacebookStrategy = require('passport-facebook').Strategy
  , io = require('socket.io').listen(server)

var UserSchema = new Schema({
  provider: String,
  uid: String,
  username: String,
  name: String,
  first_name: String,
  last_name: String,
  link: String,
  image: String,
  created: {type: Date, default: Date.now}
});
mongoose.model('User', UserSchema);

var SlideSchema = new Schema({
  id: Number,
  user_id: String, //since User's uid is String
  title: String,
  description: String, //i'm not sure if this should be String or Buffer
  file_url: String,
  created: {type: Date, default: Date.now}
});
mongoose.model('Slide', SlideSchema);

var PresentationSchema = new Schema({
  id: Number,
  user_id: String,
  title: String,
  description: String,
  date: Date,
  slide_id: Number, //Since slide's id is number(integer)
  current_page: Number
});
mongoose.model('Presentation', Presentation);

mongoose.connect(conf.db.mongo.protocol + '://' + conf.db.mongo.host + '/' + conf.db.mongo.db_name);

var User = mongoose.model('User');
var Slide = mongoose.model('Slide');
var Presentation = mongoose.model('Presentation');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback () {
  console.log('Connected to DB');
});

passport.use(new FacebookStrategy({
    clientID: conf.auth.fb.appId,
    clientSecret: conf.auth.fb.appSecret,
    callbackURL: conf.baseURL + "/auth/facebook/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    //console.log(profile);
    User.findOne({uid: String(profile.id)}, function(err, user) {
      if(user) {
        done(null, user);
      } else {
        var user = new User();
        user.provider = "facebook";
        user.uid = profile.id;
        user.username = profile._json.username;
        if(user.username == undefined){
          user.username == "undefined"
        }
        user.name = profile._json.name;
        user.first_name = profile._json.first_name;
        user.last_name = profile._json.last_name;
        user.link = profile._json.link;
        http.get({
          host: 'graph.facebook.com',
          path: '/' + user.uid + '/picture?redirect=false'
        },function(res){
          var str = "";
          res.on('data', function(chunk){
            str += chunk;
          });
          res.on('end', function(){
            var img_data = JSON.parse(str);
            console.log(img_data);
            if(img_data.data){
              user.image = img_data.data.url;
            }else{
              user.image = conf.baseURL + '/images/default.gif';
            }
            user.save(function(err) {
              if(err) { throw err; }
              done(null, user);
            });
          }).on('error', function(err){
            console.log('Got error: ' + err.message);
          });
        });
      }
    })
  }
));

passport.serializeUser(function(user, done) {
  done(null, user.uid);
});

passport.deserializeUser(function(uid, done) {
  User.findOne({uid: uid}, function (err, user) {
    done(err, user);
  });
});

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon(__dirname + '/public/images/favicon.ico'));
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({secret: 'secret'}));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(app.router);
  app.use(require('less-middleware')({ src: __dirname + '/public' }));
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

//routing
//==============================
app.get('/', function(req, res){
  if(req.user){
    res.render('index',{
      title: 'Pinteraction',
      user: req.user,
      conf: conf
    });
  }else{
    res.redirect('/login');
  }
});

app.get('/users', user.list);

app.get('/login', function(req, res){
  res.render('login');
});

app.get('/auth/facebook',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res){
    // The request will be redirected to Twitter for authentication, so this
    // function will not be called.
  });

app.get('/auth/facebook/callback', 
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/')
}

// GET slides#index
app.get('/slides',function(req, res){
  res.render('slides/index', {
    user: req.user
  });
});

// GET slides#new
app.get('/slides/new', function(req, res){
  res.render('slides/new');
});

// POST slides#create
app.post('/slides/create', function(req, res){
  
});

// GET slides#show
app.get('/slides/:id(\\d+)', function(req, res){
  console.log(req.params.id);
  Slide.findOne(req.params.id, function(err, slide){
    if(slide){
      res.render('slides/show', {slide: slide});
    }else{
      res.status('404').render('404', {title: 'Slide #' + req.params.id + ' Not Found'})
    }
  });
});

// GET slides#edit
app.get('/slides/:id(\\d+)/edit', function(req, res){
  console.log(req.params.id);
  Slide.findOne(req.params.id, function(err, slide){
    if(slide){
      res.render('slides/edit', {slide: slide});
    }else{
      res.status('404').render('404', {title: 'Slide #' + req.params.id + ' Not Found'})
    }
  });
});

// PUT slides#update
app.get('/slides/:id(\\d+)/update', function(req, res){
  console.log(req.params.id);
  Slide.findOne(req.params.id, function(err, slide){
    if(slide){
      res.redirect('/slides/' + req.params.id, {notice: 'Slide Updated'});
    }else{
      res.status('404').render('404', {title: 'Slide #' + req.params.id + ' Not Found'})
    }
  });
});


server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
