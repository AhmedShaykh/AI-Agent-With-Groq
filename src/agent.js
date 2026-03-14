import readline from "node:readline/promises";
import { pool } from "./db.js";
import Groq from "groq-sdk";
import "dotenv/config";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function callAgent() {

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const messages = [
        {
            role: "system",
            content: `You are Emmett, a personal finance assistant. You help users track expenses, income, and balances.

            Available tools:

            1. getTotalExpense({from,to})
            2. addExpense({name,amount})
            3. addIncome({name,amount})
            4. getMoneyBalance()

            Current Datetime: ${new Date().toUTCString()}`
        }
    ];

    while (true) {

        const question = await rl.question("User: ");

        if (question.toLowerCase() === "bye") {

            console.log("Assistant: Goodbye 👋");

            break;

        }

        messages.push({ role: "user", content: question });

        while (true) {

            const completion = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages,
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "getTotalExpense",
                            description: "Get total expense between two dates",
                            parameters: {
                                type: "object",
                                properties: {
                                    from: { type: "string" },
                                    to: { type: "string" }
                                },
                                required: ["from", "to"]
                            }
                        }
                    },
                    {
                        type: "function",
                        function: {
                            name: "addExpense",
                            description: "Add new expense",
                            parameters: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    amount: { type: "number" }
                                },
                                required: ["name", "amount"]
                            }
                        }
                    },
                    {
                        type: "function",
                        function: {
                            name: "addIncome",
                            description: "Add new income",
                            parameters: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    amount: { type: "number" }
                                },
                                required: ["name", "amount"]
                            }
                        }
                    },
                    {
                        type: "function",
                        function: {
                            name: "getMoneyBalance",
                            description: "Get remaining balance"
                        }
                    }
                ]
            });

            const message = completion.choices[0].message;

            messages.push(message);

            const toolCalls = message.tool_calls;

            if (!toolCalls) {

                console.log(`Assistant: ${message.content}`);

                break;

            }

            for (const tool of toolCalls) {

                const functionName = tool.function.name;

                let args = {};

                try {

                    args = JSON.parse(tool.function.arguments || "{}");

                } catch (err) {

                    console.log("Invalid arguments");

                }

                let result = "";

                if (functionName === "getTotalExpense") {

                    result = await getTotalExpense(args);

                } else if (functionName === "addExpense") {

                    result = await addExpense(args);

                } else if (functionName === "addIncome") {

                    result = await addIncome(args);

                } else if (functionName === "getMoneyBalance") {

                    result = await getMoneyBalance();

                }

                messages.push({
                    role: "tool",
                    content: result,
                    tool_call_id: tool.id
                });

            }

        }

    }

    rl.close();

};

callAgent();

async function addExpense({ name, amount }) {

    await pool.query(
        "INSERT INTO expenses (name, amount) VALUES ($1,$2)",
        [name, amount]
    );

    return `Expense "${name}" of ${amount} EUR added successfully`;

};

async function addIncome({ name, amount }) {

    await pool.query(
        "INSERT INTO incomes (name, amount) VALUES ($1,$2)",
        [name, amount]
    );

    return `Income "${name}" of ${amount} EUR added successfully`;

};

async function getTotalExpense({ from, to }) {

    const result = await pool.query(
        `SELECT COALESCE(SUM(amount),0) as total
        FROM expenses WHERE created_at BETWEEN $1 AND $2`,
        [from, to]
    );

    return `Total expense between ${from} and ${to} is ${result.rows[0].total} EUR`;

};

async function getMoneyBalance() {

    const income = await pool.query(
        "SELECT COALESCE(SUM(amount),0) as total FROM incomes"
    );

    const expense = await pool.query(
        "SELECT COALESCE(SUM(amount),0) as total FROM expenses"
    );

    const balance = income.rows[0].total - expense.rows[0].total;

    return `Your current balance is ${balance} EUR`;

};