const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcrypt");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

const PORT = process.env.PORT || 3030;

// Hashing rounds for bcrypt
const saltRound = 5;

const app = express();

app.use(express.json());
app.use(
  cors({
    exposedHeaders: ["set-cookie"],
    origin: true,
    credentials: true,
  })
);
app.use(cookieParser());

const sessionStore = new MySQLStore({
  host: "db4free.net",
  port: "3306",
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: "matchup",
});

app.set("trust proxy", 1);

app.use(
  session({
    key: "userId",
    secret: "subscribe",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: "matchupLogin",
    cookie: {
      expires: 60 * 60 * 24,
      sameSite: "none", // Set the SameSite attribute to "None"
      secure: true,
      httpOnly: true,
      domain: ".cyclic.cloud",
    },
  })
);

const db = mysql.createConnection({
  user: "petar12",
  host: "db4free.net",
  password: "0702002pm",
  database: "matchup",
  port: "3306",
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL database:", err);
  } else {
    console.log("Connected to MySQL database");
  }
});

app.post("/register", (req, res) => {
  const { name, lastName, email, phoneNum, skillLevel, favSportId, password } =
    req.body;

  // Check for null values
  if (
    name === null ||
    lastName === null ||
    email === null ||
    phoneNum === null ||
    skillLevel === null ||
    favSportId === null ||
    password === null
  ) {
    res.status(400).json({ message: "All fields are required" });
    return;
  }

  bcrypt.hash(password, saltRound, (err, hashedPassword) => {
    if (err) {
      res.status(500).json({ message: "Error hashing password" });
      return;
    }

    db.execute(
      "INSERT INTO Users (name, last_name, email, phone_num, skill_level, fav_sport_id, password) VALUES (?,?,?,?,?,?,?)",
      [name, lastName, email, phoneNum, skillLevel, favSportId, hashedPassword],
      (err, result) => {
        if (err) {
          console.log("Error during registration:", err);
          res.status(500).json({ message: "Error during registration" });
        } else {
          console.log("User registered successfully");
          res.status(201).json({ message: "Successfully created user" });
        }
      }
    );
  });
});

app.get("/login", (req, res) => {
  if (req.session.user) {
    console.log("User is logged in");
    res.status(200).json({ loggedIn: true, user: req.session.user });
  } else {
    console.log("User is not logged in");
    res.status(200).json({ loggedIn: false });
  }
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  db.execute("SELECT * FROM Users WHERE email = ?;", [email], (err, result) => {
    if (err) {
      console.log("Error during login:", err);
      res.status(500).json({ message: "Error during login" });
    }
    if (result.length > 0) {
      bcrypt.compare(password, result[0].password, (error, response) => {
        if (response) {
          console.log("User logged in successfully");
          req.session.user = result;
          res.status(200).json(result);
        } else {
          console.log("Wrong username or password");
          res.status(401).json({ message: "Wrong username or password" });
        }
      });
    } else {
      console.log("User doesn't exist");
      res.status(401).json({ message: "User doesn't exist" });
    }
  });
});

app.get("/logout", (req, res) => {
  console.log("inside");
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      res.status(500).json({ message: "Error signing out" });
    } else {
      console.log("success");
      res.clearCookie("userId"); // Clear the session cookie
      res.status(200).json({ message: "Sign out successful" });
    }
  });
});

app.post("/listings/create", (req, res) => {
  const {
    creatorId,
    sportId,
    skillLevel,
    dateTime,
    price,
    noPeople,
    additionalInfo,
    location,
  } = req.body;

  const now = new Date();
  const listingDateTime = new Date(dateTime);

  if (listingDateTime <= now) {
    res.status(400).json({ message: "Listing dateTime must be in the future" });
    return;
  }

  if (req.session.user) {
    db.execute(
      "INSERT INTO Listing (creator_id, time, sport_id, price, skill_level, num_players, additional_info, location) VALUES (?,?,?,?,?,?,?,?)",
      [
        creatorId,
        listingDateTime, // Use the modified listingDateTime
        sportId,
        price,
        skillLevel,
        noPeople,
        additionalInfo,
        location,
      ],
      (err, result) => {
        if (err) {
          console.log("Error during posting listing", err);
          res.status(500).json({ message: "Error during posting listing" });
        } else {
          console.log("Listing posted successfully");
          res.status(201).json({ message: "Successfully created listing" });
        }
      }
    );
  } else {
    console.log("Cannot post Listing because user is not logged in");
    res.status(401).json({ loggedIn: false, message: "You are not logged in" });
  }
});

app.post("/listings/enroll/:listingId", (req, res) => {
  const { userId } = req.body;
  const listingId = req.params.listingId;
  if (req.session.user) {
    // Query to get current number of players for the listing
    const getCurrentPlayersQuery = `
      SELECT COUNT(*) AS current_players
      FROM Listing_players
      WHERE listing_id = ?
    `;

    // Query to get maximum number of players allowed for the listing
    const getMaxPlayersQuery = `
      SELECT num_players
      FROM Listing
      WHERE id = ?
    `;

    db.execute(
      getCurrentPlayersQuery,
      [listingId],
      (err, currentPlayersResult) => {
        if (err) {
          console.log("Error when getting listing players", err);
          res.status(500).json({ error: "Error when getting listing players" });
          return;
        }

        const currentPlayers = currentPlayersResult[0].current_players;

        db.execute(getMaxPlayersQuery, [listingId], (err, maxPlayersResult) => {
          if (err) {
            console.log("Error when getting max listing players", err);
            res
              .status(500)
              .json({ error: "Error when getting max listing players" });
            return;
          }

          const maxPlayers = maxPlayersResult[0].num_players;

          if (currentPlayers >= maxPlayers) {
            console.log("Maximum number of players reached for this listing.");
            res.status(400).json({
              error: "Maximum number of players reached for this listing",
            });
            return;
          }

          // If the current number of players is within the limit, proceed with enrolling the user
          db.execute(
            "INSERT INTO Listing_players (listing_id, user_id) VALUES (?, ?)",
            [listingId, userId],
            (err, result) => {
              if (err) {
                console.log("Error during listing enrollment:", err);
                res
                  .status(500)
                  .json({ error: "Error during listing enrollment" });
              } else {
                console.log("Successfully enrolled into listing");
                res
                  .status(201)
                  .json({ message: "Successfully enrolled into listing" });
              }
            }
          );
        });
      }
    );
  } else {
    console.log("Cannot enroll because user is not logged in");
    res.status(401).json({ loggedIn: false, message: "You are not logged in" });
  }
});

app.get("/listings/enrolled/:id", (req, res) => {
  const userId = req.params.id;
  if (req.session.user) {
    db.execute(
      `SELECT l.*, COUNT(lp.listing_id) AS enrolled_players
       FROM Listing l
       JOIN Listing_players lp ON l.id = lp.listing_id
       WHERE lp.user_id = ?
       GROUP BY l.id;`,
      [userId],
      (err, result) => {
        if (err) {
          console.log("Error while fetching listings", err);
          res.status(500).json({ message: "Error while fetching listings" });
        } else {
          if (result.length == 0) {
            res
              .status(404)
              .json({ message: "User not enrolled in any listings" });
          } else {
            res.status(200).json(result);
          }
        }
      }
    );
  } else {
    console.log("Can't fetch listings because user is not logged in");
    res.status(401).json({ loggedIn: false, message: "You are not logged in" });
  }
});

app.get("/listings/enroll/:id", (req, res) => {
  const userId = req.params.id;
  const dateTime = req.query.dateTime;
  const sportId = req.query.sportId;

  if (req.session.user) {
    db.execute(
      `SELECT l.*, COUNT(lp.listing_id) AS enrolled_players
      FROM Listing l
      LEFT JOIN Listing_players lp ON l.id = lp.listing_id
      WHERE l.sport_id = ?
        AND DATE(l.time) = ?
        AND l.id NOT IN (
          SELECT listing_id
          FROM Listing_players
          WHERE user_id = ?
        )
        AND l.creator_id <> ?
      GROUP BY l.id;
      `,
      [sportId, dateTime, userId, userId],
      (err, result) => {
        if (err) {
          console.log("Error while fetching listings", err);
          res.status(500).json({ message: "Error while fetching listings" });
        } else {
          if (result.length === 0) {
            res
              .status(404)
              .json({ message: "No listings matching the parameters" });
          } else {
            res.status(200).json(result);
          }
        }
      }
    );
  } else {
    console.log("Can't fetch listings because user is not logged in");
    res.status(401).json({ loggedIn: false, message: "You are not logged in" });
  }
});

app.get("/listings/my/:id", (req, res) => {
  const userId = req.params.id;
  if (req.session.user) {
    db.execute(
      `SELECT l.*, COUNT(lp.listing_id) AS enrolled_players
       FROM Listing l
       LEFT JOIN Listing_players lp ON l.id = lp.listing_id
       WHERE l.creator_id = ?
       GROUP BY l.id;`,
      [userId],
      (err, result) => {
        if (err) {
          console.log("Error while fetching your listings", err);
          res
            .status(500)
            .json({ message: "Error while fetching your listings" });
        } else {
          res.status(200).json(result);
        }
      }
    );
  } else {
    console.log("Can't fetch user's listings because user is not logged in");
    res.status(401).json({ loggedIn: false, message: "You are not logged in" });
  }
});

app.post("/reviews/submit", (req, res) => {
  const { listingId, userId, rating, text } = req.body;
  if (req.session.user) {
    db.execute(
      "INSERT INTO Review (listing_id, user_id, rating, text) VALUES (?, ?, ?, ?)",
      [listingId, userId, rating, text],
      (err, result) => {
        if (err && err.code === "ER_DUP_ENTRY") {
          console.log(
            "Review already exists for this listing by the same user"
          );
          res.status(400).json({ message: "Review already exists" });
        } else if (err) {
          console.log("Error during review submission:", err);
          res.status(500).json({ message: "Error during review submission" });
        } else {
          console.log("Review submitted successfully");
          res.status(201).json({ message: "Review submitted successfully" });
        }
      }
    );
  } else {
    console.log("Can't submit review because user is not loggedIn");
    res.status(401).json({ loggedIn: false, message: "You are not logged in" });
  }
});

app.get("/reviews/:userId", (req, res) => {
  const userId = req.params.userId;
  if (req.session.user) {
    db.execute(
      `SELECT r.*
      FROM Review r
      JOIN Listing l ON r.listing_id = l.id
      WHERE l.creator_id = ?;`,
      [userId],
      (err, result) => {
        if (err) {
          console.log("Error while fetching user reviews:", err);
          res
            .status(500)
            .json({ message: "Error while fetching user reviews" });
        } else {
          res.status(200).json(result);
        }
      }
    );
  } else {
    console.log("Can't get reviews because user is not loggedIn");
    res.status(401).json({ loggedIn: false, message: "You are not logged in" });
  }
});

app.listen(PORT, () => {
  console.log("Running server on port 3001");
});
