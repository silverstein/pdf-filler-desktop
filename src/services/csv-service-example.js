/**
 * CSV Service Usage Examples
 * 
 * This file demonstrates how to use the CSVService class for various CSV operations.
 * Remove this file in production - it's for reference only.
 */

const CSVService = require('./csv-service');
const path = require('path');

async function examples() {
    const csvService = new CSVService();
    
    // Example 1: Parse CSV from file
    try {
        const data = await csvService.parseCSV('/path/to/your/file.csv');
        console.log('Parsed CSV data:', data);
    } catch (error) {
        console.error('Parse error:', error.message);
    }
    
    // Example 2: Parse CSV string with custom options
    const csvString = `name;age;city
    John Smith;25;New York
    Jane Doe;30;Los Angeles`;
    
    const parsed = await csvService.parseCSVString(csvString, {
        delimiter: ';',
        trim: true,
        skipEmptyLines: true
    });
    
    // Example 3: Generate CSV from data
    const employees = [
        { name: 'Alice Johnson', position: 'Developer', salary: 75000 },
        { name: 'Bob Wilson', position: 'Designer', salary: 65000 }
    ];
    
    const csvOutput = await csvService.generateCSV(employees);
    console.log('Generated CSV:', csvOutput);
    
    // Example 4: Save data to CSV file
    await csvService.saveCSV(employees, './uploads/employees.csv', null, {
        delimiter: ',',
        encoding: 'utf8'
    });
    
    // Example 5: Auto-detect delimiter
    const mixedSample = 'a,b,c\n1,2,3\n4,5,6';
    const detectedDelimiter = csvService.detectDelimiter(mixedSample);
    console.log('Detected delimiter:', detectedDelimiter);
    
    // Example 6: Validate CSV file
    const validation = await csvService.validateCSV('./uploads/employees.csv', {
        requiredColumns: ['name', 'position'],
        maxRows: 1000
    });
    
    if (validation.isValid) {
        console.log('CSV is valid!');
    } else {
        console.log('Issues found:', validation.details.issues);
    }
    
    // Example 7: Get CSV file information
    const info = await csvService.getCSVInfo('./uploads/employees.csv');
    console.log('CSV Info:', {
        rows: info.rowCount,
        columns: info.columnCount,
        size: info.size,
        headers: info.headers
    });
}

// Export for use in other modules
module.exports = { examples };