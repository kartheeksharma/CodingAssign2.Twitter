const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
//const format = require("date=fns/format");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3001, () => {
      console.log("Server running at http://localhost:3001/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

//1.API register
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const checkUser = `SELECT username FROM user WHERE username='${username}';`;
  const dbUser = await db.get(checkUser);
  if (dbUser !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const reqQuery = `INSERT into user(name,username,password,gender)
                            VALUES('${name}','${username}','${hashedPassword}','${gender}');`;
      await db.run(reqQuery);
      response.status(200);
      response.send("User created successfully");
    }
  }
});

//2.API Login
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUser = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(checkUser);
  if (dbUser !== undefined) {
    const checkPassword = await bcrypt.compare(password, dbUser.password);
    if (checkPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

//Authentication Token
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//3.API Latest tweets of people whom user follows
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  //get userId
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  //console.log(getUserId);
  //get follower Ids from userId
  const getFollowerIdQuery = `SELECT following_user_id FROM follower
                                WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowerIdQuery);
  //console.log(getFollowerIds);
  //get follower Ids array
  const getFollowerIdsArr = getFollowerIds.map((each) => {
    return each.following_user_id;
  });
  //Query
  const getTweetQuery = `SELECT user.username, tweet.tweet,tweet.date_time AS dateTime
  FROM user INNER JOIN tweet ON user.user_id = tweet.user_id 
  WHERE user.user_id in (${getFollowerIdsArr})
  ORDER BY tweet.date_time DESC
  LIMIT 4 ; `;
  const respResult = await db.all(getTweetQuery);
  response.send(respResult);
});

//4.List of all names of people whom user follows
app.get("/user/following/", authenticateToken, async (request, response) => {
  //get userId
  let { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  //console.log(getUserId);
  //get follower Ids from userId
  const getFollowerIdQuery = `SELECT following_user_id FROM follower
                                WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowerIdQuery);
  //console.log(getFollowerIds);
  //get follower Ids array
  const getFollowerIdsArr = getFollowerIds.map((each) => {
    return each.following_user_id;
  });
  //names query
  const userFollowsQuery = `SELECT name FROM user 
                        WHERE user_id in (${getFollowerIdsArr});`;
  const respResult = await db.all(userFollowsQuery);
  response.send(respResult);
});

//5.List of all names of people who follows the user
app.get("/user/followers/", authenticateToken, async (request, response) => {
  //get userId
  let { username } = request;
  const getUserIdQuery = `SELECT user_id  FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  //console.log(getUserId);
  //get follower Ids from userId
  const getFollowerIdQuery = `SELECT follower_user_id FROM follower
                                WHERE following_user_id = ${getUserId.user_id};`;
  const getFollowerIds = await db.all(getFollowerIdQuery);
  //console.log(getFollowerIds);
  //get follower Ids array
  const getFollowerIdsArr = getFollowerIds.map((each) => {
    return each.follower_user_id;
  });
  //names query
  const followsUserQuery = `SELECT name FROM user 
                        WHERE user_id in (${getFollowerIdsArr});`;
  const respResult = await db.all(followsUserQuery);
  response.send(respResult);
});

//6.User request a tweet of user he is following
const api6output = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  };
};
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  //get userId
  let { username } = request;
  const getUserIdQuery = `SELECT user_id  FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  //get follower Ids from userId
  const getFollowingIdQuery = `SELECT following_user_id FROM follower
                                WHERE follower_user_id = ${getUserId.user_id};`;
  const getFollowingIdsArr = await db.all(getFollowingIdQuery);
  //get follower Ids array
  const getFollowingIds = getFollowingIdsArr.map((each) => {
    return each.following_user_id;
  });
  //tweets made by users he is following
  const tweetIdQuery = `SELECT tweet_id FROM tweet WHERE user_id in (${getFollowingIds});`;
  const tweetIdArray = await db.all(tweetIdQuery);
  const followingTweetIds = tweetIdArray.map((each) => {
    return each.tweet_id;
  });
  //console.log(followingTweetIds);
  //condition
  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likesCountQuery = `SELECT count(user_id) AS likes FROM like WHERE tweet_id=${tweetId};`;
    const likesCount = await db.get(likesCountQuery);
    const replyCountQuery = `SELECT count(user_id) AS replies FROM reply WHERE tweet_id=${tweetId};`;
    const replyCount = await db.get(replyCountQuery);
    const tweetDateQuery = `SELECT tweet, date_time FROM tweet WHERE tweet_id=${tweetId};`;
    const tweetDate = await db.get(tweetDateQuery);
    response.send(api6output(tweetDate, likesCount, replyCount));
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//7.List of usernames who liked the tweet
const convertLikedUserObjToResp = (dbObj) => {
  return {
    likes: dbObj,
  };
};
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    //get userId
    let { username } = request;
    const getUserIdQuery = `SELECT user_id  FROM user WHERE username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    //get follower Ids from userId
    const getFollowingIdQuery = `SELECT following_user_id FROM follower
                                WHERE follower_user_id = ${getUserId.user_id};`;
    const getFollowingIdsArr = await db.all(getFollowingIdQuery);
    //get follower Ids array
    const getFollowingIds = getFollowingIdsArr.map((each) => {
      return each.following_user_id;
    });
    //tweets made by users he is following
    const tweetIdQuery = `SELECT tweet_id FROM tweet WHERE user_id in (${getFollowingIds});`;
    const tweetIdArray = await db.all(tweetIdQuery);
    const getTweetIds = tweetIdArray.map((each) => {
      return each.tweet_id;
    });
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getLikedUsersQuery = `SELECT user.username AS likes FROM user 
                                    INNER JOIN like ON user.user_id=like.user_id
                                    WHERE like.tweet_id= ${tweetId};`;
      const getLikedUsersArr = await db.all(getLikedUsersQuery);
      const getLikedUsersResp = getLikedUsersArr.map((each) => {
        return each.likes;
      });
      response.send(convertLikedUserObjToResp(getLikedUsersResp));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//8.List of replies from the user he is following
const convertUserReplyObjToResp = (dbObj) => {
  return {
    replies: dbObj,
  };
};
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    //get userId
    let { username } = request;
    const getUserIdQuery = `SELECT user_id  FROM user WHERE username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    //get follower Ids from userId
    const getFollowingIdQuery = `SELECT following_user_id FROM follower
                                WHERE follower_user_id = ${getUserId.user_id};`;
    const getFollowingIdsArr = await db.all(getFollowingIdQuery);
    //get follower Ids array
    const getFollowingIds = getFollowingIdsArr.map((each) => {
      return each.following_user_id;
    });
    //tweets made by users he is following
    const tweetIdQuery = `SELECT tweet_id FROM tweet WHERE user_id in (${getFollowingIds});`;
    const tweetIdArray = await db.all(tweetIdQuery);
    const getTweetIds = tweetIdArray.map((each) => {
      return each.tweet_id;
    });
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getUsernameReplyQuery = `SELECT user.name, reply.reply FROM user INNER JOIN reply 
                                    ON user.user_id= reply.user_id 
                                    WHERE reply.tweet_id=${tweetId};`;
      const getUsernameReplyTweet = await db.all(getUsernameReplyQuery);
      response.send(convertUserReplyObjToResp(getUsernameReplyTweet));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//9.Returns list of all tweets of user
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  //get userId
  let { username } = request;
  const getUserIdQuery = `SELECT user_id  FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  //console.log(getUserId);
  //tweets made by user
  const tweetIdQuery = `SELECT tweet_id FROM tweet WHERE user_id = ${getUserId.user_id};`;
  const tweetIdArray = await db.all(tweetIdQuery);
  const getTweetIds = tweetIdArray.map((each) => {
    return each.tweet_id;
  });
  //console.log(getTweetIds);
});

//10.Create a tweet in tweet table
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  //get userId
  let { username } = request;
  const getUserIdQuery = `SELECT user_id  FROM user WHERE username='${username}';`;
  const getUserId = await db.get(getUserIdQuery);
  //tweet
  const { tweet } = request.body;
  const currentDate = new Date();
  const postReqQuery = `INSERT into tweet(tweet, user_id, date_time)
                        VALUES('${tweet}', ${getUserId.user_id}, '${currentDate.date_time}');`;
  const responseResult = await db.run(postReqQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

//11.Delete a tweet
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    //get userId
    let { username } = request;
    const getUserIdQuery = `SELECT user_id  FROM user WHERE username='${username}';`;
    const getUserId = await db.get(getUserIdQuery);
    //tweets made by user
    const tweetIdQuery = `SELECT tweet_id FROM tweet WHERE user_id = ${getUserId.user_id};`;
    const tweetIdArray = await db.all(tweetIdQuery);
    const getTweetIds = tweetIdArray.map((each) => {
      return each.tweet_id;
    });
    if (getTweetIds.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
