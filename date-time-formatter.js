/**
 * Date and Time Formatter - English Locale Enforcer
 * Forces all dates and times to display in English numerals regardless of system locale
 */

const DateTimeFormatter = {
    /**
     * Format date to English YYYY-MM-DD format
     * @param {string|Date} dateValue - Date value in any format
     * @returns {string} Formatted date in YYYY-MM-DD format with English numerals
     */
    formatDate(dateValue) {
        if (!dateValue) return '';
        
        let date;
        
        // Handle Date object
        if (dateValue instanceof Date) {
            date = dateValue;
        } 
        // Handle string dates
        else {
            const str = this.ensureEnglishNumerals(dateValue.toString().trim());
            
            // Already in YYYY-MM-DD format
            if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
                const parts = str.split('-');
                return `${parts[0]}-${parts[1]}-${parts[2]}`;
            }
            
            // DD/MM/YYYY or DD-MM-YYYY - parse and convert to YYYY-MM-DD
            const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
            if (ddmmyyyy) {
                const day = ddmmyyyy[1].padStart(2, '0');
                const month = ddmmyyyy[2].padStart(2, '0');
                const year = ddmmyyyy[3];
                return `${year}-${month}-${day}`;
            }
            
            // Try parsing as Date
            try {
                date = new Date(str);
                if (isNaN(date.getTime())) {
                    return str;
                }
            } catch (e) {
                return str;
            }
        }
        
        // Format to YYYY-MM-DD with English numerals
        const year = this.ensureEnglishNumerals(date.getFullYear().toString());
        const month = this.ensureEnglishNumerals(String(date.getMonth() + 1).padStart(2, '0'));
        const day = this.ensureEnglishNumerals(String(date.getDate()).padStart(2, '0'));
        
        return `${year}-${month}-${day}`;
    },

    /**
     * Format time to English HH:MM AM/PM format
     * @param {string} timeValue - Time value in any format
     * @returns {string} Formatted time in HH:MM AM/PM format with English numerals
     */
    formatTime(timeValue) {
        if (!timeValue) return '';
        
        const str = timeValue.toString().trim();
        
        // Already in HH:MM AM/PM format
        const ampmMatch = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (ampmMatch) {
            const hour = this.ensureEnglishNumerals(ampmMatch[1]);
            const minute = this.ensureEnglishNumerals(ampmMatch[2]);
            const ampm = ampmMatch[3].toUpperCase();
            return `${hour}:${minute} ${ampm}`;
        }
        
        // Try HH:MM format (24-hour)
        const timeMatch = str.match(/(\d+):(\d+)/);
        if (timeMatch) {
            let hour = parseInt(timeMatch[1]);
            const minute = parseInt(timeMatch[2]);
            let ampm = 'AM';
            
            if (hour >= 12) {
                ampm = 'PM';
                if (hour > 12) hour -= 12;
            }
            if (hour === 0) hour = 12;
            
            const hourStr = this.ensureEnglishNumerals(hour.toString());
            const minuteStr = this.ensureEnglishNumerals(String(minute).padStart(2, '0'));
            
            return `${hourStr}:${minuteStr} ${ampm}`;
        }
        
        // Return as-is if can't parse
        return this.ensureEnglishNumerals(str);
    },

    /**
     * Format date and time together
     * @param {string|Date} dateValue - Date value
     * @param {string} timeValue - Time value
     * @returns {string} Formatted date and time
     */
    formatDateTime(dateValue, timeValue) {
        const date = this.formatDate(dateValue);
        const time = this.formatTime(timeValue);
        if (date && time) {
            return `${date} ${time}`;
        }
        return date || time || '';
    },

    /**
     * Format date for display in tables (e.g., "2026/02/20" - yyyy/mm/dd)
     * @param {string|Date} dateValue - Date value
     * @returns {string} Formatted date string in yyyy/mm/dd
     */
    formatDateForDisplay(dateValue) {
        const yyyyMmDd = this.formatDate(dateValue);
        return yyyyMmDd ? yyyyMmDd.replace(/-/g, '/') : '';
    },

    /**
     * Convert user input (yyyy/mm/dd or yyyy-mm-dd) to API format YYYY-MM-DD
     * @param {string} dateStr - Date string from input
     * @returns {string} YYYY-MM-DD for API
     */
    formatDateForApi(dateStr) {
        if (!dateStr || !dateStr.trim()) return '';
        const parsed = this.parseDate(dateStr.trim());
        return parsed ? this.formatDate(parsed) : dateStr.replace(/\//g, '-');
    },

    /**
     * Format time for display in tables (e.g., "02:30 PM")
     * @param {string} timeValue - Time value
     * @returns {string} Formatted time string
     */
    formatTimeForDisplay(timeValue) {
        return this.formatTime(timeValue);
    },

    /**
     * Ensure all numerals in a string are English (0-9)
     * Converts Arabic-Indic numerals (٠-٩) and Eastern Arabic numerals to English
     * @param {string} str - String that may contain non-English numerals
     * @returns {string} String with English numerals only
     */
    ensureEnglishNumerals(str) {
        if (!str) return '';
        
        const arabicToEnglish = {
            '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
            '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
            '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
            '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
        };
        
        return str.toString().split('').map(char => {
            return arabicToEnglish[char] !== undefined ? arabicToEnglish[char] : char;
        }).join('');
    },

    /**
     * Parse date from various formats and return Date object
     * @param {string|Date} dateValue - Date value in any format
     * @returns {Date|null} Date object or null if invalid
     */
    parseDate(dateValue) {
        if (!dateValue) return null;
        
        if (dateValue instanceof Date) {
            return dateValue;
        }
        
        const str = this.ensureEnglishNumerals(dateValue.toString().trim());
        
        // Try YYYY-MM-DD format first
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
            const parts = str.split('-');
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        
        // Try YYYY/MM/DD format
        if (/^\d{4}\/\d{2}\/\d{2}$/.test(str)) {
            const parts = str.split('/');
            return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        }
        
        // Try other formats
        try {
            const date = new Date(str);
            if (!isNaN(date.getTime())) {
                return date;
            }
        } catch (e) {
            return null;
        }
        
        return null;
    },

    /**
     * Get current date in YYYY-MM-DD format with English numerals
     * @returns {string} Current date formatted
     */
    getCurrentDate() {
        return this.formatDate(new Date());
    },

    /**
     * Get current time in HH:MM AM/PM format with English numerals
     * @returns {string} Current time formatted
     */
    getCurrentTime() {
        const now = new Date();
        let hours = now.getHours();
        const minutes = now.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        
        if (hours > 12) hours -= 12;
        if (hours === 0) hours = 12;
        
        const hourStr = this.ensureEnglishNumerals(hours.toString());
        const minuteStr = this.ensureEnglishNumerals(String(minutes).padStart(2, '0'));
        
        return `${hourStr}:${minuteStr} ${ampm}`;
    },

    /**
     * Format date for report header (e.g., "February 20, 2026")
     * @param {string|Date} dateValue - Date value
     * @returns {string} Formatted date string
     */
    formatDateForReport(dateValue) {
        const date = this.parseDate(dateValue);
        if (!date) return '';
        
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        
        const year = this.ensureEnglishNumerals(date.getFullYear().toString());
        const month = monthNames[date.getMonth()];
        const day = this.ensureEnglishNumerals(date.getDate().toString());
        
        return `${month} ${day}, ${year}`;
    },

    /**
     * Format time for report header (e.g., "02:30 PM")
     * @param {string} timeValue - Time value
     * @returns {string} Formatted time string
     */
    formatTimeForReport(timeValue) {
        return this.formatTime(timeValue);
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DateTimeFormatter;
}
