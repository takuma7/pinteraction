
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
  , mkdirp = require('mkdirp') /* $ npm install mkdirp */
  , fs = require('fs')
  , _ = require('underscore');

// Pad string function.
_.mixin({
  pad: function (target, length) {
    var padStr = '0';
    var target = target.toString();
    var result = target;
    var num = length - target.length;
    for (var i=0; i<num; i++) {
      result = padStr + result;
    }
    return result;
  }
});

var getUpfileDir = function () {
  var d = new Date();
  return d.getFullYear() + _.pad(d.getMonth() + 1, 2) + '/' + _.pad(d.getDate() + '/', 2);
};

var ObjectId = mongoose.Types.ObjectId;

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
  user_id: String, //since User's uid is String
  title: String,
  description: String, //i'm not sure if this should be String or Buffer
  file_url: String,
  file_name: String,
  file_type: String,
  created: {type: Date, default: Date.now}
});
mongoose.model('Slide', SlideSchema);

var SessionSchema = new Schema({
  id: Number,
  user_id: String,
  title: String,
  description: String,
  date: Date,
  slide_id: mongoose.Schema.Types.ObjectId, //Since slide's id is ObjectId
  current_page: Number
});
mongoose.model('Session', SessionSchema);

mongoose.connect(conf.db.mongo.protocol + '://' + conf.db.mongo.host + '/' + conf.db.mongo.db_name);

var User = mongoose.model('User');
var Slide = mongoose.model('Slide');
var Session = mongoose.model('Session');

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback () {
  console.log('Connected to DB');
});

passport.use(new FacebookStrategy({
    clientID: conf.auth.fb.appId,
    clientSecret: conf.auth.fb.appSecret,
    callbackURL: conf.EXPRESS_ROOT + "/auth/facebook/callback"
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
              user.image = conf.ESPRESS_ROOT + '/images/default.gif';
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
  app.use(express.bodyParser({
    uploadDir: './tmp'
  }));
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
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) { return next(); }
  res.redirect('/')
}

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

// POST upload
app.post('/upload', function(req, res){
  var upfile = req.files.file
  if (upfile) {
    var tmpPath = './' + upfile.path;
    var saveDir = getUpfileDir();
    var dir_ = path.normalize(conf.UPLOAD_BASEPATH + saveDir);
    if (!path.existsSync(dir_)) mkdirp.sync(dir_);
    var savePath = saveDir + path.basename(tmpPath) + path.extname(upfile.name);
    var targetPath = path.normalize(conf.UPLOAD_BASEPATH + savePath);

    fs.rename(tmpPath, targetPath, function (err) {
      if (err) throw err;
      res.redirect('slides/new');
    });
  }
});

//
// routes for users
//

// GET users#index
app.get('/users', function(req, res){
  User.find({}, function(err, users){
    res.render('users/index', {
        user: req.user
      , users: users 
    });
  });
});

// GET users#show
app.get('/users/:uid(\\w+)', function(req, res){
  User.findOne({uid: req.params.uid}, function(err, vser){
    if(vser){
      Slide.find({user_id: vser.uid}, function(err, vser_slides){
        Session.find({user_id: vser.uid}, function(err, vser_sessions){
          res.render('users/show', {
              user: req.user
            , vser: vser
            , vser_slides: vser_slides
            , vser_sessions: vser_sessions
          });          
        });
      });
    }else{
      res.status('404').render('404', {
        title: 'User Not Found'
      });
    }
  });
});

//
// routes for slides
//

// GET slides#index
app.get('/slides', function(req, res){
  Slide.find({}, function(err, slides){
    // console.log(slides);
    res.render('slides/index', {
        user: req.user
      , slides: slides
      , IS_SLIDES: true
    });    
  });
});

// GET slides#new
app.get('/slides/new', ensureAuthenticated, function(req, res){
  res.render('slides/new', {
      user: req.user
    , IS_SLIDES: true
    });
});

// POST slides#create
app.post('/slides/create', ensureAuthenticated, function(req, res){
  var upfile = req.files.file
  if (upfile) {
    var tmpPath = './' + upfile.path;
    var saveDir = getUpfileDir();
    var dir_ = path.normalize(conf.UPLOAD_BASEPATH + saveDir);
    if (!path.existsSync(dir_)) mkdirp.sync(dir_);
    var savePath = saveDir + path.basename(tmpPath) + path.extname(upfile.name);
    var targetPath = path.normalize(conf.UPLOAD_BASEPATH + savePath);

    fs.rename(tmpPath, targetPath, function (err) {
      if (err) throw err;
      var slide = new Slide();
      console.log(req.params);
      console.log(req.body);
      slide = _.extend(slide, {
          title: req.body.title
        , description: req.body.description
        , user_id: req.user.uid
        , file_name: upfile.name
        , file_type: upfile.type
        , file_url: savePath
      });
      console.log(slide);
      slide.save(function (err) {
        res.redirect('slides/' + slide._id);
      });
    });
  }
});

// GET slides#show
app.get('/slides/:id(\\w+)', function(req, res){
  console.log(ObjectId.fromString(req.params.id));
  Slide.findOne({_id: ObjectId.fromString(req.params.id)}, function(err, slide){
    if(slide){
      User.findOne({uid: slide.user_id}, function(err, author){
        res.render('slides/show', {
            slide: slide
          , user: req.user
          , author: author
          , IS_SLIDES: true
        });
      });
    }else{
      res.status('404').render('404', {
          title: 'Slide #' + req.params.id + ' Not Found'
        , user: req.user
        , IS_SLIDES: true
      });
    }
  });
});

// GET slides#edit
app.get('/slides/:id(\\w+)/edit', ensureAuthenticated, function(req, res){
  console.log(ObjectId.fromString(req.params.id));
  Slide.findOne({_id: ObjectId.fromString(req.params.id)}, function(err, slide){
    if(slide){
      User.findOne({uid: slide.user_id}, function(err, author){
        res.render('slides/show', {
            slide: slide
          , user: req.user
          , author: author
          , IS_SLIDES: true
        });
      });
    }else{
      res.status('404').render('404', {
          title: 'Slide #' + req.params.id + ' Not Found'
        , user: req.user
        , IS_SLIDES: true
      });
    }
  });
});

// PUT slides#update
app.post('/slides/:id(\\w+)/update', ensureAuthenticated, function(req, res){
  console.log(ObjectId.fromString(req.params.id));
  Slide.findOne({_id: ObjectId.fromString(req.params.id)}, function(err, slide){
    if(slide){
      User.findOne({uid: slide.user_id}, function(err, author){
        res.render('slides/show', {
            slide: slide
          , user: req.user
          , author: author
          , IS_SLIDES: true
        });
      });
    }else{
      res.status('404').render('404', {
          title: 'Slide #' + req.params.id + ' Not Found'
        , user: req.user
        , IS_SLIDES: true
      });
    }
  });
});

// DELETE slides#delete

//
// routes for sessions
//

// GET sessions#index

// GET sessions#new

// POST sessions#create

// GET sessions#show

// GET sessions#edit

// PUT session#update

// DELETE sessions#delete


server.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
