var theApp = new Vue({
  el: "#app",
  data: {
    activePeriod: "today",
    lastFetch: "",
    showModal: false,
    gamesList: "",
    results: [],
    usernames: ["alexandrzavalnij", "jefimserg", "TheErix", "vadimostapchuk"],
    periods: ["today", "yesterday", "month", "prevmonth"],
    currentGames: [],
    showOpenings: false,
  },
  methods: {
    openGame(gameUrl) {
      window.open(gameUrl, "_blank");
    },
    openModal(games) {
      this.currentGames = games;
      console.log(games);
      this.showModal = true;
    },
    closeModal() {
      this.showModal = false;
    },
    fetchStats(period) {
      this.activePeriod = period;

      this.results = [];

      let date = new Date();
      if (period === "yesterday") {
        date.setDate(date.getDate() - 1);
      }

      if (period === "prevmonth") {
        date.setMonth(date.getMonth() - 1);
      }

      let year = date.getFullYear();
      let month = String(date.getMonth() + 1).padStart(2, "0");
      let day = String(date.getDate()).padStart(2, "0");

      Promise.all(
        this.usernames.map((username) =>
          this.fetchUserStats(username, year, month, day, period),
        ),
      )
        .then(() => {
          this.updateLastFetched();
        })
        .catch((error) => {
          console.error("Error fetching data:", error);
        });
    },
    fetchUserStats(username, year, month, day, period) {
      let url = `https://api.chess.com/pub/player/${username}/games/${year}/${month}`;
      return this.fetchWithRetry(url, 3)
        .then((data) =>
          this.processGames(data, username, period, year, month, day),
        )
        .then((stats) => {
          this.results.push({
            username: username,
            statsByType: stats,
          });
        });
    },
    fetchWithRetry(url, retries, delay = 1000) {
      return new Promise((resolve, reject) => {
        const attempt = () => {
          fetch(url)
            .then((response) => {
              if (response.ok) {
                response
                  .json()
                  .then((data) => resolve(data))
                  .catch((jsonError) => {
                    throw jsonError;
                  });
              } else {
                throw new Error("Network response was not ok.");
              }
            })
            .catch((fetchError) => {
              if (retries > 0) {
                setTimeout(attempt, delay, --retries);
              } else {
                reject(fetchError);
              }
            });
        };
        attempt();
      });
    },
    processGames(data, username, period, year, month, day) {
      let statsByType = {};

      data.games.forEach((game) => {
        let gameDate = new Date(game.end_time * 1000);
        if (
          period !== "month" &&
          period !== "prevmonth" &&
          (gameDate.getFullYear() !== year ||
            gameDate.getMonth() + 1 !== parseInt(month, 10) ||
            gameDate.getDate() !== parseInt(day, 10))
        ) {
          return;
        }

        let gameType = game.time_class;
        if (!statsByType[gameType]) {
          statsByType[gameType] = {
            played: 0,
            won: 0,
            lost: 0,
            draw: 0,
            duration: 0,
            ratingBefore: 0,
            rating: 0,
            games: [],
          };
        }

        game.resultSubType =
          game.white.username.toLowerCase() === username.toLowerCase()
            ? game.white.result
            : game.black.result;
        game.result = this.determineResult(game.resultSubType);
        if (game.resultSubType === "win")
          game.resultSubType =
            game.white.username.toLowerCase() === username.toLowerCase()
              ? game.black.result
              : game.white.result;
        statsByType[gameType].played++;
        statsByType[gameType].games.push(game);
        statsByType[gameType][game.result]++;
        let userIsWhite =
          game.white.username.toLowerCase() === username.toLowerCase();
        let correctPlayer = userIsWhite ? game.white : game.black;
        statsByType[gameType].ratingBefore || (statsByType[gameType].ratingBefore = correctPlayer.rating);
        statsByType[gameType].rating = correctPlayer.rating;
        let duration = this.getGameDurationFromPGN(game.pgn);
        game.opening = this.getGameOpening(game.pgn);
        statsByType[gameType].duration += duration;
      });

      return statsByType;
    },
    determineResult(resultSubType) {
      switch (resultSubType) {
        case "win":
          return "won";
        case "checkmated":
        case "timeout":
        case "resigned":
        case "abandoned":
          return "lost";
        case "agreed":
        case "stalemate":
        case "insufficient":
        case "50move":
        case "timevsinsufficient":
        case "repetition":
          return "draw";
        default:
          return "unknown";
      }
    },
    iconClassByResult(game) {
      return `chess-icon-${game.result} chess-icon-${game.resultSubType}`;
    },
    formatDuration(seconds) {
      let hours = Math.floor(seconds / 3600);
      let minutes = Math.floor((seconds % 3600) / 60);
      let formattedDuration = `${hours}h ${minutes}m`;
      return formattedDuration;
    },
    getGameOpening(pgn) {
      // Extract the opening name from the PGN
      // example:
      // [ECOUrl "https://www.chess.com/openings/Sicilian-Defense-Open-Accelerated-Dragon-Exchange-Variation-5...bxc6"]

      var fullUrl = pgn.match(/\[ECOUrl "(.+?)"\]/);
      if (fullUrl && fullUrl.length > 1) {
        fullUrl = fullUrl[1]; // This captures only the URL part
      }

      const ecoUrlMatch = pgn.match(
        /\[ECOUrl \"https:\/\/www\.chess\.com\/openings\/(.+?)\"\]/,
      );
      if (!fullUrl) {
        return { name: "Unknown opening", url: "#" }; // format { "name": "url" }
      }

      const openingUrl = ecoUrlMatch[1];
      const openingName = openingUrl
        .split("/")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
        .split("-")
        .join(" ");
      const openingNameFirst50Chars = openingName.substring(0, 50) + "...";
      return { name: openingNameFirst50Chars, url: fullUrl };
    },
    getGameDurationFromPGN(pgn) {
      const startTimeMatch = pgn.match(/\[StartTime \"(\d+:\d+:\d+)\"\]/);
      const endTimeMatch = pgn.match(/\[EndTime \"(\d+:\d+:\d+)\"\]/);
      if (!startTimeMatch || !endTimeMatch) {
        return 0;
      }
      const parseTime = (timeStr) => {
        const [hours, minutes, seconds] = timeStr.split(":").map(Number);
        return hours * 3600 + minutes * 60 + seconds;
      };
      const startTime = parseTime(startTimeMatch[1]);
      const endTime = parseTime(endTimeMatch[1]);
      return Math.max(endTime - startTime, 0);
    },
    updateLastFetched() {
      this.lastFetch = new Date().toLocaleString();
      localStorage.setItem("lastFetch", this.lastFetch);
    },
    percentage(value, total) {
      return ((value / total) * 100).toFixed(1);
    },
    colorClass(accuracy) {
      if (accuracy < 60) {
        return "red";
      } else if (accuracy >= 60 && accuracy < 80) {
        return "yellow";
      } else if (accuracy >= 80 && accuracy < 95) {
        return "green";
      } else {
        return "blue";
      }
    },
    ratingClass(details) {
        if (details.rating > details.ratingBefore) return "rating-climb";
        if (details.rating < details.ratingBefore) return "rating-fall";
        return "";
    },
    nonameClass(username) {
      if (this.usernames.indexOf(username) == -1) return "player-noname";
    },
  },
  mounted() {
    // if query string contains a list of usernames, then set the usernames
    const urlParams = new URLSearchParams(window.location.search);
    const usernames = urlParams.get("usernames");
    if (usernames) {
      this.usernames = usernames.split(",");
    }

    const defaultPeriod = urlParams.get("period") || "today";
    this.fetchStats(defaultPeriod);
  },
  computed: {
    periodButtonClass() {
      return function (period) {
        return {
          active: period === this.activePeriod,
        };
      };
    },
    totalStats() {
      let totalsHash = {};
      this.results.forEach((user) => {
        const totals = {
          played: 0,
          won: 0,
          lost: 0,
          draw: 0,
          duration: 0,
        };
        Object.entries(user.statsByType).forEach(([gameType, stats]) => {
          if (gameType == "daily") return;

          totals.played += stats.played;
          totals.won += stats.won;
          totals.lost += stats.lost;
          totals.draw += stats.draw;
          totals.duration += stats.duration;
        });
        // Storing the totals by username in the hash
        totalsHash[user.username] = totals;
      });
      return totalsHash;
    },
  },
});
