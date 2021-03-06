import redis from "redis";
import express from "express";
import cors from "cors";
import { getLeaderboardData } from "./getLeaderboardData";
import {
    LeaderBoardPosition,
    RedisLeaderBoardPositions,
    BoardData,
} from "./interfaces";

const client = redis.createClient({
    url:
        process.env.REDIS_URL ||
        "rediss://default:ognm4av69h62s0jc@redis-27db2bc3-polymarket-d1ee.aivencloud.com:12790",
});
client.on("error", (error) => {
    console.error(error);
});

const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 8000;

const CACHE_TTL = 1000 * 60 * 60;
const updateCache = (
    marketMakerAddress: string,
    data: BoardData,
    callback: (err: Error | null, reply: string) => void,
) => {
    const cachedData: RedisLeaderBoardPositions = {
        ...data,
        lastUpdate: new Date().getTime(),
    };
    console.log("cachedData", cachedData);

    client.set(marketMakerAddress, JSON.stringify(cachedData), callback);
};

app.get("/leaderboard/:marketMakerAddress", async (req, res) => {
    const { marketMakerAddress } = req.params;
    console.log("marketMakerAddress", marketMakerAddress);

    client.get(marketMakerAddress, async (_err, reply) => {
        console.log("reply", reply);
        if (!reply) {
            console.log("Talking to subgraph");

            const data = await getLeaderboardData(marketMakerAddress);
            if (!data) {
                console.log("No data found");
                return res.status(404).send({ status: "Not Found" });
            }

            console.log("!reply data", data);
            updateCache(marketMakerAddress, data, redis.print);
            return res.json(data);
        }
        console.log("Reply exists reply", reply);
        const data: RedisLeaderBoardPositions = JSON.parse(reply);
        res.json(data);

        // Update if expired
        if (
            !data.lastUpdate ||
            data.lastUpdate + CACHE_TTL < new Date().getTime()
        ) {
            // Update cache with current data then overwrite
            // This avoids re-fetching tens of times
            updateCache(marketMakerAddress, data, async () => {
                console.log(
                    "Data Reupdate in bg marketMakerAddress",
                    marketMakerAddress,
                );
                // Update the data secretly
                const newData = await getLeaderboardData(marketMakerAddress);
                updateCache(marketMakerAddress, newData, redis.print);
            });
        }
    });
});

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});
