"use strict";

// Description
//   A hubot script that interacts with AWS Lex
//
// Configuration:
//   LIST_OF_ENV_VARS_TO_SET
//
// Commands:
//   hubot hello - <what the respond trigger does>
//   orly - <what the hear trigger does>
//
// Notes:
//   <optional notes required for the script>
//
// Author:
//   Ben Hanzl <ben.hanzl@gmail.com>

module.exports = (robot) => {
  robot.respond(/hello/, (message) => {
    message.reply("hello!");
  });

  robot.hear(/orly/, (message) => {
    message.send("yarly");
  });
};
