// Imports
import {google} from "googleapis";

// Create authenticated Google Tasks client (OAuth2, not service account -
// personal Task lists have no sharing mechanism to grant the service account access)
function getTasksClient() {
    const auth = new google.auth.OAuth2(
        process.env.GOOGLE_TASKS_CLIENT_ID,
        process.env.GOOGLE_TASKS_CLIENT_SECRET,
    );
    auth.setCredentials({refresh_token: process.env.GOOGLE_TASKS_REFRESH_TOKEN});
    return google.tasks({version: "v1", auth});
}

// List all task lists on the account
async function listTaskLists() {
    const tasks = getTasksClient();
    const response = await tasks.tasklists.list();

    console.log(JSON.stringify(response.data, null, 2));
}
// listTaskLists();

// Create a task with a title, notes, and a date-only due date
async function insertTask(tasklistId, title, notes, due) {
    const tasks = getTasksClient();
    const response = await tasks.tasks.insert({
        tasklist: tasklistId,
        resource: {
            title,
            notes,
            due: due ? new Date(`${due}T00:00:00.000Z`).toISOString() : undefined,
        },
    });

    console.log(JSON.stringify(response.data, null, 2));
}
// insertTask("<tasklistId from listTaskLists()>", "Test task", "Created with Guimail", "2026-07-10");

// Create a task with a due timestamp that has a non-midnight time, to
// confirm whether the time portion is silently discarded as documented
async function insertTaskWithTime(tasklistId, title) {
    const tasks = getTasksClient();
    const response = await tasks.tasks.insert({
        tasklist: tasklistId,
        resource: {
            title,
            due: "2026-07-10T15:30:00.000Z",
        },
    });

    console.log(JSON.stringify(response.data, null, 2));
}
// insertTaskWithTime("<tasklistId from listTaskLists()>", "Test task with time");
