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

const startRobot = () => {
  const robot = new Robot(null, "mock-adapter-v3", false, "Hubot");
  robot.loadFile(path.resolve("src/"), "hubot-lex.js");

  robot.adapter.on("connected", () => {
    robot.brain.userForId("1", {
      name: "john",
      real_name: "John Doe",
      room: "#test"
    });
  });

  robot.run();

  return robot;
};

beforeEach(() => {
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});

describe("require('hubot-lex')", () => {
  it("exports a function", () => {
    expect(require("../index")).to.be.a("Function");
  });
});

describe("hubot-lex (without environment variables)", () => {
  let robot;
  let user;

  afterEach(() => {
    delete process.env.LEX_API_URL;
    delete process.env.LEX_API_KEY;
    delete process.env.LEX_START_REGEXP;

    robot.shutdown();
  });

  it("doesn't respond if LEX_API_URL not specified", (done) => {
    robot = startRobot();
    user = robot.brain.userForName("john");

    const respond = sinon.spy(robot, "respond");

    robot.adapter.receive(new TextMessage(user, "@hubot lex hello"));

    expect(respond).to.have.not.been.called;
    done();
  });
});

describe("hubot-lex", () => {
  let lex;
  let robot;
  let user;

  beforeEach(() => {
    const lexURL = "http://lex-api-gateway.test.com";
    lex = nock(lexURL);

    process.env.LEX_API_URL = `${lexURL}/messages`;
    process.env.LEX_START_REGEXP = "lex";

    robot = startRobot();
    user = robot.brain.userForName("john");
  });

  afterEach(() => {
    delete process.env.LEX_API_URL;
    delete process.env.LEX_START_REGEXP;

    robot.shutdown();
  });

  it("responds to /lex/i", (done) => {
    lex.post("/messages").reply(200, {
      message: "hello!",
    });

    robot.adapter.on("reply", (envelope, strings) => {
      expect(strings[0]).to.eql("hello!");
      done();
    });

    robot.adapter.receive(new TextMessage(user, "@hubot lex hello"));
  });

  it("doesn't send @hubot to Lex", (done) => {
    const request = lex.post("/messages", (body) => {
      return body.text === "lex hello";
    }).reply(200, {
      message: "hello!",
    });

    robot.adapter.on("reply", (envelope, strings) => {
      expect(request.isDone());
      expect(strings[0]).to.eql("hello!");
      done();
    });

    robot.adapter.receive(new TextMessage(user, "@hubot lex hello"));
  });

  it("replies with error message if Lex returns an error", (done) => {
    lex.post("/messages").reply(500, {});

    robot.adapter.on("reply", (envelope, strings) => {
      expect(strings[0]).to.eql("Unable to communicate with AWS Lex.");
      done();
    });

    robot.adapter.receive(new TextMessage(user, "@hubot lex hello"));
  });
});
