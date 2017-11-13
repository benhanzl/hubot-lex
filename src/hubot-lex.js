"use strict";

// Description
//   A hubot script that interacts with AWS Lex.
//
// Configuration:
//   LEX_API_URL - Required.
//   LEX_API_KEY - Optional.
//   LEX_START_REGEX - Optional.
//
// Commands:
//   hubot lex - <what the respond trigger does>
//   orly - <what the hear trigger does>
//
// Notes:
//   <optional notes required for the script>
//
// Author:
//   Ben Hanzl <ben.hanzl@gmail.com>

const safe = require("safe-regex");

module.exports = (robot) => {
  const apiURL = process.env.LEX_API_URL;
  const apiKey = process.env.LEX_API_KEY;
  const defaultErrorMessage = "Unable to communicate with AWS Lex.";

  let startRegExp = /lex/i;

  if (!apiURL) {
    robot.logger.error("hubot-lex: LEX_API_URL not specified.");
    return;
  }

  const regExp = process.env.LEX_START_REGEX;
  if (regExp && safe(regExp)) {
    // eslint-disable-next-line security/detect-non-literal-regexp
    startRegExp = new RegExp(regExp, "i");
  } else {
    robot.logger.info("hubot-lex: LEX_START_REGEX not specified or unsafe.");
  }

  robot.respond(startRegExp, (match) => {
    robot.logger.info(`hubot-lex: Responding to ${startRegExp.toString()}.`);

    const request = robot.http(apiURL)
      .header("Accept", "application/json")
      .header("Content-Type", "application/json");
    if (apiKey) {
      request.header("x-api-key", apiKey);
    }

    request.post(JSON.stringify(match.message))((error, response, body) => {
      if (error) {
        robot.logger.error(`hubot-lex: ${error}`);
        match.reply(defaultErrorMessage);
        return;
      }

      if (response.statusCode !== 200) {
        const message = `${response.statusCode} ${JSON.parse(body).message}`;
        robot.logger.error(`hubot-lex: ${message}`);
        match.reply(defaultErrorMessage);
        return;
      }

      const data = JSON.parse(body);
      if (data.message) {
        match.reply(data.message);
      }
    });
  });
};
