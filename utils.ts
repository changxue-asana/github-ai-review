// utils.ts
import chalk from 'chalk';
import moment from 'moment-timezone';

export const getTimeStamp = () => {
    return moment().tz('America/Los_Angeles').format('YYYY-MM-DD HH:mm:ss');
}

export const logInfo = (message: string) => {
    console.log(chalk.blue(`[INFO] ${getTimeStamp()} - ${message}`));
};

export const logError = (message: string) => {
    console.log(chalk.red(`[ERROR] ${getTimeStamp()} - ${message}`));
};
