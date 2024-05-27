// githubApi.ts
import axios from 'axios';
import chalk from 'chalk';
import { GITHUB_TOKEN, GITHUB_USERNAME } from './config';

const GITHUB_API_PULL_REQUESTS_URL = `https://api.github.com/search/issues?q=type:pr+assignee:${GITHUB_USERNAME}+state:open`;

const headers = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28'
};

const diffHeaders = {
    'Authorization': `Bearer ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3.diff',
    'X-GitHub-Api-Version': '2022-11-28'
};

export const fetchAssignedPullRequests = async () => {
    try {
        const response = await axios.get(GITHUB_API_PULL_REQUESTS_URL, { headers });
        return response.data.items;
    } catch (error) {
        console.error('Error fetching pull requests:', error);
        throw error;
    }
};

// Function to get the code diff of a pull request by PR number along with the PR details
export const fetchPullRequestDetails = async (owner: string, repo: string, prNumber: number) => {
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
export const commentOnPullRequest = async (owner: string, repo: string, prNumber: number, comment: string) => {
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
        const response = await axios.post(url, { body: comment }, { headers });
        console.log(`Commented on PR #${prNumber}:`, response.data.body);
    } catch (error) {
        console.error(`Error commenting on pull request #${prNumber}:`, error.response ? error.response.data : error.message);
    }
};

// Function to approve and comment on a pull request
export const approveAndCommentOnPullRequest = async (owner: string, repo: string, prNumber: number) => {
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