"use strict";

/* global describe, beforeEach, afterEach, it */

const chai = require("chai");
const nock = require("nock");
const path = require("path");
const sinon = require("sinon");

chai.use(require("sinon-chai"));
const expect = chai.expect;

const Hubot = require("hubot");
const Robot = Hubot.Robot;
const TextMessage = Hubot.TextMessage;

function startRobot() {
  const robot = new Robot(null, "mock-adapter-v3", false, "Hubot");
  robot.loadFile(path.resolve("src/"), "hubot-lex.js");

  robot.adapter.on("connected", function() {
    robot.brain.userForId("1", {
      name: "john",
      real_name: "John Doe",
      room: "#test"
    });

    robot.brain.userForId("Ignore", {
      name: "ignore",
      real_name: "Ignore User",
      room: "#test"
    });
  });

  robot.run();

  return robot;
};

beforeEach(function() {
  nock.disableNetConnect();
});

afterEach(function() {
  nock.cleanAll();
  nock.enableNetConnect();
});

describe("require('hubot-lex')", function() {
  it("exports a function", function() {
    expect(require("../index")).to.be.a("Function");
  });
});

describe("hubot-lex (without environment variables)", function() {
  let robot;
  let user;

  afterEach(function() {
    delete process.env.LEX_API_URL;
    delete process.env.LEX_API_KEY;
    delete process.env.LEX_START_REGEXP;

    robot.shutdown();
  });

  it("doesn't respond if LEX_API_URL not specified", function(done) {
    robot = startRobot();
    user = robot.brain.userForName("john");

    const respond = sinon.spy(robot, "respond");

    robot.adapter.receive(new TextMessage(user, "@hubot lex hello"));

    expect(respond).to.have.not.been.called;
    done();
  });
});

describe("hubot-lex", function() {
  let lex;
  let robot;
  let user;

  beforeEach(function() {
    const lexURL = "http://lex-api-gateway.test.com";
    lex = nock(lexURL);

    process.env.LEX_API_URL = `${lexURL}/messages`;
    process.env.LEX_START_REGEXP = "lex";

    robot = startRobot();
    user = robot.brain.userForName("john");
  });

  afterEach(function() {
    delete process.env.LEX_API_URL;
    delete process.env.LEX_START_REGEXP;

    robot.shutdown();
  });

  it("sends text to Lex if it matches the start regexp", function(done) {
    lex.post("/messages").reply(200, {
      message: "hello!"
    });

    robot.adapter.on("reply", function(envelope, strings) {
      expect(strings[0]).to.eql("hello!");
      done();
    });

    robot.adapter.receive(new TextMessage(user, "@hubot lex hello"));
  });

  it("ignores text if it doesn't match the start regexp", function(done) {
    const request = sinon.spy(lex, "post");

    robot.adapter.receive(new TextMessage(user, "@hubot hello"));

    expect(request).to.not.be.called;
    done();
  });

  it("doesn't send @hubot in the text to Lex", function(done) {
    const request = lex.post("/messages", function(body) {
      return body.text === "lex hello";
    }).reply(200, {
      message: "hello!"
    });

    robot.adapter.on("reply", function(envelope, strings) {
      expect(request.isDone());
      expect(strings[0]).to.eql("hello!");
      done();
    });

    robot.adapter.receive(new TextMessage(user, "@hubot lex hello"));
  });

  it("replies with error message if Lex returns an error", function(done) {
    lex.post("/messages").reply(500, {});

    robot.adapter.on("reply", function(envelope, strings) {
      expect(strings[0]).to.eql("Unable to communicate with AWS Lex.");
      done();
    });

    robot.adapter.receive(new TextMessage(user, "@hubot lex hello"));
  });

  it("starts a conversation if Lex responds with ConfirmIntent", function(done) {
    lex.post("/messages").reply(200, {
      dialogState: "ConfirmIntent",
      message: "Are you sure?"
    });

    const conversationKey = `conversation-${user.room}`;
    expect(robot.brain.get(conversationKey)).to.be.null;

    robot.adapter.on("reply", function(envelope, strings) {
      expect(strings[0]).to.eql("Are you sure?");
      expect(robot.brain.get(conversationKey)).to.not.be.null;
      done();
    });

    robot.adapter.receive(new TextMessage(user, "@hubot lex start conversation"));
  });

  it("sends message (that doesn't match start regexp) to Lex if conversation started", function(done) {
    const conversationKey = `conversation-${user.room}`;
    robot.brain.set(conversationKey, Date.now());

    lex.post("/messages").reply(200, {
      message: "hello!"
    });

    robot.adapter.on("reply", function(envelope, strings) {
      expect(strings[0]).to.eql("hello!");
      done();
    });

    robot.adapter.receive(new TextMessage(user, "@hubot hello"));
  });

  it("stops a conversation if Lex responds with ElicitIntent", function(done) {
    lex.post("/messages").reply(200, {
      dialogState: "Fulfilled",
      message: "Your request has been completed."
    });

    const conversationKey = `conversation-${user.room}`;
    robot.brain.set(conversationKey, Date.now());

    robot.adapter.on("reply", function(envelope, strings) {
      expect(strings[0]).to.eql("Your request has been completed.");
      expect(robot.brain.get(conversationKey)).to.be.null;
      done();
    });

    robot.adapter.receive(new TextMessage(user, "@hubot lex stop conversation"));
  });
});

describe("hubot-lex (with ignored users)", function() {
  let lex;
  let robot;

  let ignoreUser;
  let user;

  beforeEach(function() {
    const lexURL = "http://lex-api-gateway.test.com";
    lex = nock(lexURL);

    process.env.LEX_API_URL = `${lexURL}/messages`;
    process.env.LEX_IGNORE_USER_IDS = "Ignore,1234";

    robot = startRobot();
    ignoreUser = robot.brain.userForName("ignore");
    user = robot.brain.userForName("john");
  });

  afterEach(function() {
    delete process.env.LEX_API_URL;
    delete process.env.LEX_IGNORE_USER_IDS;

    robot.shutdown();
  });

  it("doesn't send messages to Lex if the user is ingored", function(done) {
    const request = sinon.spy(lex, "post");

    robot.adapter.receive(new TextMessage(ignoreUser, "@hubot lex hello"));

    expect(request).to.not.be.called;
    done();
  });

  it("sends messages to Lex if the user is not ingored", function(done) {
    lex.post("/messages").reply(200, {
      message: "hello!"
    });

    robot.adapter.on("reply", function(envelope, strings) {
      expect(strings[0]).to.eql("hello!");
      done();
    });

    robot.adapter.receive(new TextMessage(user, "@hubot lex hello"));
  });
});
