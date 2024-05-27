// openaiApi.ts
import OpenAI from 'openai';
import { openaiConfig } from './config';

const openai = new OpenAI(openaiConfig);

export const getCodeReviewFromOpenAI = async (title: string, body: string, diff: string) => {
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
                        2.6 If the PR is about refactoring, code cleanup or adding tests, reduce the risk level by one level unless critical issues are identified.
                    3. If the PR is missing any context for determining the risk level, highlight it and ask for more information. Also increase the risk level accordingly if the context is extremely crucial for risk level assessment.
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

// Core function to analyze the risk level of a pull request
export const getPullRequestRiskLevel = async (codeReviewFromAI: string) => {
    const riskLevelMatch = codeReviewFromAI.match(/Risk Level\s?:\s?\s*(.*)/i);
    const riskLevel = riskLevelMatch ? riskLevelMatch[1].toLowerCase().trim() : 'unknown';
    return riskLevel;
};
