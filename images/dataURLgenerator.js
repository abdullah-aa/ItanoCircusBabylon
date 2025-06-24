const fs = require('fs');
const path = require('path');

// Get the current directory where the script is being run
const currentDirectory = process.cwd();

// Read all files in the current directory
fs.readdir(currentDirectory, (err, files) => {
    if (err) {
        console.error('Error reading the directory:', err);
        return;
    }

    // An array to hold all the file names and their data URLs
    const outputLines = [];

    // Loop through each file in the directory
    files.forEach(file => {
        // Get the full path of the file
        const filePath = path.join(currentDirectory, file);

        // Get the file's stats to check if it's a file and not a directory
        const stats = fs.statSync(filePath);

        // Check if it is a file and not the script file itself or the output file
        if (stats.isFile() && file !== path.basename(__filename) && file !== 'data_urls.txt') {
            try {
                // Read the file's content
                const fileContent = fs.readFileSync(filePath);

                // Get the file's mime type
                const mimeType = getMimeType(file);

                // Create the data URL
                const dataUrl = `data:${mimeType};base64,${fileContent.toString('base64')}`;

                // Add the file name and its data URL to our array, each on a new line
                outputLines.push(`${file}\n${dataUrl}`);
            } catch (readErr) {
                console.error(`Error reading file ${file}:`, readErr);
            }
        }
    });

    // Join all the lines with a newline character for separation between entries
    const outputContent = outputLines.join('\n\n'); // Use double newline to separate entries

    // Write the file names and data URLs to a text file
    fs.writeFile('data_urls.txt', outputContent, (writeErr) => {
        if (writeErr) {
            console.error('Error writing to data_urls.txt:', writeErr);
            return;
        }
        console.log('Successfully created data_urls.txt');
    });
});

/**
 * A helper function to determine the MIME type based on file extension.
 * This is a simplified implementation. For a more robust solution,
 * consider using a library like 'mime-types'.
 * @param {string} filename - The name of the file.
 * @returns {string} The determined MIME type.
 */
function getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
        case '.txt':
            return 'text/plain';
        case '.html':
            return 'text/html';
        case '.css':
            return 'text/css';
        case '.js':
            return 'application/javascript';
        case '.json':
            return 'application/json';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.gif':
            return 'image/gif';
        case '.svg':
            return 'image/svg+xml';
        default:
            return 'application/octet-stream';
    }
}