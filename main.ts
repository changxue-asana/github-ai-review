import axios from 'axios';
import OpenAI from 'openai';
import chalk from 'chalk';
import moment from 'moment-timezone';

// Reading sensitive information from environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// GitHub API endpoint for pull requests assigned to the user
const GITHUB_API_URL = `https://api.github.com/search/issues?q=type:pr+assignee:${GITHUB_USERNAME}+state:open`;

// Headers for GitHub API requests
const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28'
};

// Headers for fetching diffs
const diffHeaders = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3.diff',
    'X-GitHub-Api-Version': '2022-11-28'
};

// OpenAI API configuration (replace with your own OpenAI API key)
const openaiConfig = {
    apiKey: OPENAI_API_KEY
};

const openai = new OpenAI(openaiConfig);

// Function to get open pull requests assigned to the user
const getAssignedPullRequests = async () => {
    try {
        const response = await axios.get(GITHUB_API_URL, { headers });
        return response.data.items;
    } catch (error) {
        console.error('Error fetching pull requests:', error.response ? error.response.data : error.message);
        return [];
    }
};

// Function to get the code diff of a pull request by PR number along with the PR details
const getPullRequestDetails = async (owner: string, repo: string, prNumber: number) => {
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;
        const response = await axios.get(url, { headers });

        if (response.status !== 200) {
            throw new Error(`[Error] GitHub PR request: received status code ${response.status}`);
        }

        const pullRequest = response.data;
        const diffResponse = await axios.get(url, { headers: diffHeaders });

        if (diffResponse.status !== 200) {
            throw new Error(`[Error] GitHub PR diff request: received status code ${diffResponse.status}`);
        }

        return { title: pullRequest.title, body: pullRequest.body, diff: diffResponse.data };

    } catch (error) {
        if (error.response) {
            console.error(`[Error] Response data: ${JSON.stringify(error.response.data)}`);
            console.error(`[Error] Response status: ${error.response.status}`);
            console.error(`[Error] Response headers: ${JSON.stringify(error.response.headers)}`);
        } else if (error.request) {
            console.error(`[Error] No response received: ${JSON.stringify(error.request)}`);
        } else {
            console.error(`[Error] Error message: ${error.message}`);
        }
        return null;
    }
};

// Function to comment on a pull request
const commentOnPullRequest = async (owner: string, repo: string, prNumber: number, comment: string) => {
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
        const response = await axios.post(url, { body: comment }, { headers });
        console.log(`Commented on PR #${prNumber}:`, response.data.body);
    } catch (error) {
        console.error(`Error commenting on pull request #${prNumber}:`, error.response ? error.response.data : error.message);
    }
};

// Function to approve and comment on a pull request
const approveAndCommentOnPullRequest = async (owner: string, repo: string, prNumber: number) => {
    try {
        // Approve the pull request
        const approveUrl = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`;
        await axios.post(approveUrl, {
            event: 'APPROVE'
        }, { headers });

        // Comment on the pull request
        const commentUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
        await axios.post(commentUrl, { body: '✅ LGTM!' }, { headers });
        console.log(chalk.greenBright(`Approve PR #${prNumber}: ✅ LGTM!`));
    } catch (error) {
        console.error(`Error approving or commenting on pull request #${prNumber}:`, error.response ? error.response.data : error.message);
    }
};

// Function to send the diff to OpenAI for code review
const getCodeReviewFromOpenAI = async (title: string, body: string, diff: string) => {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: "system",
                    content: "You are a 10x programmer knowledgeable in code reviews."
                },
                {
                    role: "user",
                    content: `
                    Please assist me with a code review for this PR, focusing on the following aspects:

                    1. Clearly outline the intentions of the PR.
                    2. Assess the risk level of the PR based on the impact of the changes, using the following scale: very low, low, medium-low, medium, medium-high, high, very high. Identify and highlight any risky code changes. Output the risk level as Risk Level: [level].
                        2.1 If in the PR description, the author mentions that they have tested the changes, lower the risk level.
                        2.2 If the PR is small and contains minimal changes, lower the risk level.
                        2.3 If the PR contains unit tests or integration tests, lower the risk level.
                        2.4 If this PR is for bootcamp tasks under /learning_playground folder, lower the risk level unless some crucial issues.
                        2.5 If the PR is related to documentation, lower the risk level.
                        2.6 If the PR is a refactor or removing unused code, lower the risk level.
                    3. If the PR is missing any context for determining the risk level, highlight it and ask for more information. Also increase the risk level accordingly if the context is crucial for risk level assessment.
                    4. If the PR contains potential bugs, please highlight them in a designated 'Bug' section.
                    5. Show only highly relevant suggestions and improvements in the 'Improvement' section.

                    PR Title:
                    ${title}

                    PR Description:
                    ${body}

                    Code Diff:
                    ${diff}
                `
                }
            ],
            max_tokens: 3000,
            temperature: 0.1
        });

        if (!response || !response.choices || response.choices.length === 0) {
            return 'No response from OpenAI.';
        }

        return (response.choices[0].message?.content ?? 'No response from OpenAI.').trim();

    } catch (error) {
        console.error('Error getting code review from OpenAI:', error.response ? error.response.data : error.message);
        return 'Error getting code review from OpenAI.';
    }
};

// Main function to constantly check for new pull requests, print the diff, and comment
const checkForNewPullRequests = async () => {
    let knownPrs = new Set<string>();

    while (true) {
        const timestamp = moment().tz('America/Los_Angeles').format('YYYY-MM-DD HH:mm:ss');  // Format timestamp in PDT
        console.log(`[${timestamp}] - Checking for new pull requests assigned to me...`); // Modified line to include timestamp

        const pullRequests = await getAssignedPullRequests();

        for (const pr of pullRequests) {
            if (!knownPrs.has(pr.url)) {
                const prNumber = pr.number;
                const prTitle = pr.title;
                console.log(`New PR assigned: #${prNumber} - ${prTitle}`);

                // Extract repository owner and name from the pull request URL
                const repoUrl = pr.repository_url;
                const [owner, repo] = repoUrl.split('/').slice(-2);

                // Get the PR details including the diff
                const prDetails = await getPullRequestDetails(owner, repo, prNumber);
                if (!prDetails) {
                    continue;
                }

                const { title, body, diff } = prDetails;

                // Get code review from OpenAI
                const codeReview = await getCodeReviewFromOpenAI(title, body, diff);
                console.log(chalk.magenta("====================================="));
                console.log(chalk.magenta('Code Review:\n'), codeReview);

                // Extract risk level from the OpenAI response
                const riskLevelMatch = codeReview.match(/Risk Level\s?:\s?\s*(.*)/i);
                const riskLevel = riskLevelMatch ? riskLevelMatch[1].toLowerCase().trim() : 'unknown';

                console.log(chalk.yellowBright(`Pull Request URL: ${pr.url}`));
                console.log(chalk.yellowBright(`Risk Level: ${riskLevel}`));

                // Approve the PR and leave a comment if the risk level is low or very low
                if (riskLevel.includes('low')) {
                    await approveAndCommentOnPullRequest(owner, repo, prNumber);
                }
                console.log(chalk.magenta("====================================="));
                knownPrs.add(pr.url);
            }
        }

        // Wait for 30 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 60000));
    }
};

// Start checking for new pull requests
checkForNewPullRequests();