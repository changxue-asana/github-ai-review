import { fetchAssignedPullRequests, fetchPullRequestDetails, approveAndCommentOnPullRequest } from './githubApi';
import { getCodeReviewFromOpenAI, getPullRequestRiskLevel } from './openaiApi';
import { getTimeStamp } from './utils';
import chalk from 'chalk';

// Main function to constantly check for new pull requests, print the diff, and comment
const periodicallyPollingPullRequests = async () => {
    let knownPrs = new Set<string>();

    while (true) {
        console.log(`[${getTimeStamp()}] - Checking for new pull requests assigned to me...`);

        const pullRequests = await fetchAssignedPullRequests();

        for (const pr of pullRequests) {
            if (!knownPrs.has(pr.url)) {
                const prNumber = pr.number;
                const prTitle = pr.title;
                console.log(`New PR assigned: #${prNumber} - ${prTitle}`);

                // Extract repository owner and name from the pull request URL
                const repoUrl = pr.repository_url;
                const [owner, repo] = repoUrl.split('/').slice(-2);

                // Get the PR details including the diff
                const prDetails = await fetchPullRequestDetails(owner, repo, prNumber);
                if (!prDetails) {
                    continue;
                }

                const { title, body, diff } = prDetails;

                // Get code review from OpenAI
                const codeReview = await getCodeReviewFromOpenAI(title, body, diff);
                console.log(chalk.magenta("====================================="));
                console.log(`AI Code Review: ${codeReview}\n`);

                const riskLevel = await getPullRequestRiskLevel(codeReview);
                console.log(chalk.yellowBright(`Pull Request URL: ${pr.html_url}`));
                console.log(chalk.yellowBright(`Risk Level: ${riskLevel}`));

                // Approve the PR and leave a comment if the risk level is low or very low
                if (riskLevel.includes('low')) {
                    await approveAndCommentOnPullRequest(owner, repo, prNumber);
                }

                console.log(chalk.magenta("====================================="));
                knownPrs.add(pr.url);
            }
        }

        // Wait for 1 min before checking again
        await new Promise(resolve => setTimeout(resolve, 1 * 60 * 1000));
    }
};

// Start checking for new pull requests
periodicallyPollingPullRequests();