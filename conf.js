module.exports = {
  auth: {
    fb: {
        appId: '501636539926798'
      , appSecret: '682ce79eea2191c282e2ed710b739105'
    }
  },
  db: {
    mongo: {
      protocol: "mongodb",
      host: "localhost",
      db_name: "pinteraction-express",
    }
  },
  EXPRESS_ROOT: "http://localhost:3000",
  UPLOAD_BASEPATH: __dirname + "/public/uploads/",
  io: {
    client: {
      host: "localhost",
      port: 3000
    }
  },
};
