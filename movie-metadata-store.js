// src/movie-store.js

// Movie Metadata Schema
const MOVIE_SCHEMA_REFERENCE = {
  _id: "string (CID)", // Primary key IPFS Content CID
  title: { en: "string", zh: "string" /* ... */ },
  year: "number",
  genre: { en: ["string"], zh: ["string"] /* ... */ },
  director: { en: ["string"], zh: ["string"] /* ... */ },
  actors: { en: ["string"], zh: ["string"] /* ... */ },
  plot_summary: { en: "string", zh: "string" /* ... */ },
  keywords: { en: ["string"], zh: ["string"] /* ... */ },
  language: ["string"],
  country: { en: ["string"], zh: ["string"] /* ... */ },
  rating: "number",
  source_info: { name: "string", id: "string" },
  imdb_id: "string", // Must be provided, used for _id
  imdb_rating: "number", // Optional
  added_timestamp_ms: "number",
};

// Basic validation function
function validateMovieData(data) {
  if (!data || typeof data !== "object") {
    console.error("Validation failed: Data is not an object.");
    return false;
  }
  if (!data.title || typeof data.title !== "object" || !data.title.en) {
    console.error("Validation failed: Missing valid title.en field.");
    return false;
  }
  if (typeof data.year !== "number") {
    console.error("Validation failed: year field must be a number.");
    return false;
  }
  if (
    !data.imdb_id ||
    typeof data.imdb_id !== "string" ||
    !data.imdb_id.startsWith("tt")
  ) {
    console.error(
      "Validation failed: Missing valid imdb_id field (should be a string starting with 'tt').",
    );
    return false;
  }
  // More strict validation rules can be added here as needed
  return true;
}

export class MovieMetadataStore {
  /**
   * Constructor
   * @param {object} helia - Helia instance (IPFS implementation)
   * @param {object} orbitdbInstance - OrbitDB instance created via createOrbitDB
   */
  constructor(helia, orbitdbInstance) {
    if (!helia) {
      throw new Error(
        "Helia instance is required when constructing MovieMetadataStore.",
      );
    }
    if (!orbitdbInstance) {
      throw new Error(
        "OrbitDB instance is required when constructing MovieMetadataStore.",
      );
    }
    this.helia = helia;
    this.orbitdb = orbitdbInstance;
    this.db = null; // OrbitDB database instance reference
    this.dbAddress = null; // Database address (e.g., /orbitdb/zd...)
    console.log("MovieMetadataStore constructed.");
  }

  /**
   * Initializes the OrbitDB documents database.
   * @param {string} [dbName=config.databaseName] - The name of the database to open or create.
   */
  async initialize(dbName = config.databaseName) {
    if (this.db) {
      console.warn(
        `Database ${this.dbAddress} is already initialized. Skipping.`,
      );
      return;
    }
    console.log(`Initializing OrbitDB database: ${dbName}...`);
    try {
      // Use orbitdb.open() to open or create the database instance
      this.db = await this.orbitdb.open(dbName, {
        type: "documents", // Specify the database type
        sync: true, // Automatically sync data with connected peers
      });

      this.dbAddress = this.db.address; // Get the database address
      console.log(`Database ${this.dbAddress} initialized and loaded.`);

      // Set up event listeners (optional)
      this._setupEventListeners();
    } catch (error) {
      console.error(`Error initializing database '${dbName}':`, error);
      this.db = null; // Ensure db instance is null on error
      this.dbAddress = null;
      throw error; // Rethrow the error for the caller
    }
  }

  /**
   * Sets up database event listeners.
   * @private
   */
  _setupEventListeners() {
    if (!this.db || !this.db.events) {
      console.warn(
        "Cannot set up event listeners: Database instance or events object is invalid.",
      );
      return;
    }

    // Triggered when the database is updated (local write or remote sync)
    // The 'update' event parameter 'entry' contains details about the operation
    this.db.events.on("update", (entry) => {
      console.log(
        `[Event] Database ${this.dbAddress} updated. Operation hash: ${entry.hash}, Operation type: ${entry.payload.op}`,
      );
      // Finer-grained UI updates or logic can be triggered here based on
      // entry.payload.op (e.g., 'PUT', 'DEL') and entry.payload.value (or key)
      // e.g., if (entry.payload.op === 'PUT') { ui.updateItem(entry.payload.value); }
    });

    // Other events like 'join', 'leave', 'error' can be listened to as needed
    // this.db.events.on('error', (error) => { ... });
    // this.db.events.on('join', (peerId, heads) => { ... });
    console.log(`Event listeners set up for database ${this.dbAddress}.`);
  }

  /**
   * Adds or updates movie metadata in the database (based on imdb_id).
   * If a document with the same imdb_id (_id) already exists, it will be overwritten.
   * @param {object} metadata - Movie metadata object conforming to the schema, must include a valid imdb_id.
   * @returns {Promise<string>} - Returns the document's _id (which is the imdb_id).
   * @throws {Error} If data validation fails or the database is not initialized.
   */
  async addOrUpdateMovie(metadata) {
    if (!this.db) {
      throw new Error("Database not initialized. Cannot add or update movie.");
    }
    if (!validateMovieData(metadata)) {
      // Use basic validation
      throw new Error("Invalid movie metadata format.");
    }

    try {
      // Use imdb_id as the document's _id
      const docToPut = {
        _id: metadata.imdb_id,
        ...metadata,
      };

      // Use put() to add or update the document
      // put() overwrites existing documents with the same _id
      const hash = await this.db.put(docToPut); // put() returns the operation hash
      console.log(
        `Movie metadata added/updated (_id: ${docToPut._id}), operation hash: ${hash}`,
      );
      return docToPut._id; // Return the _id we used
    } catch (error) {
      console.error(
        `Error adding/updating movie (_id: ${metadata.imdb_id}):`,
        error,
      );
      throw error;
    }
  }

  /**
   * Gets the value of a single document by its IMDb ID (_id).
   * @param {string} imdbId - The IMDb ID of the movie (which is the document's _id).
   * @returns {Promise<object|null>} - Returns the found document value, or null if not found or data structure is invalid.
   * @throws {Error} If the database is not initialized or a query error occurs.
   */
  async getMovieByImdbId(imdbId) {
    if (!this.db) {
      throw new Error("Database not initialized. Cannot get movie.");
    }
    // Basic validation for the input imdbId
    if (!imdbId || typeof imdbId !== "string" || !imdbId.startsWith("tt")) {
      console.warn(`Attempting to get movie with invalid IMDb ID: ${imdbId}`);
      return null;
    }
    try {
      // get(key) uses the _id (imdbId in our case) to find the document
      const result = await this.db.get(imdbId);

      // Check the return value of get()
      if (result) {
        // Determine the actual document value.
        // Some versions/scenarios might return the raw entry { hash, key, value },
        // others might return the value directly. Handle both robustly.
        const movieValue = result.value !== undefined ? result.value : result;

        // Now movieValue should be the actual movie object, but still check its content
        if (movieValue && typeof movieValue === "object") {
          // Safely attempt to log the title
          const titleDisplay =
            movieValue.title?.en || movieValue.title?.zh || "[No Title]";
          console.log(
            `Successfully retrieved movie by _id '${imdbId}': ${titleDisplay}`,
          );
          // Return the plain value object
          return movieValue;
        } else {
          // Although get returned something, it's not the expected object structure
          console.warn(
            `Retrieved unexpected data structure for _id '${imdbId}':`,
            result,
          );
          return null;
        }
      } else {
        // get() returned null or undefined
        console.log(`Movie with _id '${imdbId}' not found.`);
        return null;
      }
    } catch (error) {
      console.error(`Error retrieving movie with _id '${imdbId}':`, error);
      throw error;
    }
  }

  /**
   * Gets all movie entries (value part only) from the database.
   * @returns {Promise<Array<object>>} - Returns an array of all document values.
   * @throws {Error} If the database is not initialized.
   */
  async getAllMovies() {
    if (!this.db) {
      throw new Error("Database not initialized. Cannot get all movies.");
    }
    try {
      // all() returns an array of entry objects: [{ hash: '...', key: '...', value: {...} }, ...]
      const allEntries = await this.db.all();
      console.log(
        `Found ${allEntries.length} records in database ${this.dbAddress}.`,
      );
      // Extract and return only the value part of each entry
      return allEntries.map((entry) => entry.value);
    } catch (error) {
      console.error(`Error getting all movies:`, error);
      throw error;
    }
  }

  /**
   * Searches for movies by title using query (POC implementation - full scan).
   * @param {string} titleQuery - The title keyword to search for.
   * @param {string} [targetLanguage='en'] - The language of the title to search ('en', 'zh', etc.).
   * @returns {Promise<Array<object>>} - Returns an array of matching document values (value[]).
   * @throws {Error} If the database is not initialized.
   */
  async searchMoviesByTitle(titleQuery, targetLanguage = "en") {
    if (!this.db) {
      throw new Error("Database not initialized. Cannot search by title.");
    }
    const lowerCaseQuery = titleQuery.toLowerCase();
    console.log(
      `Searching by title "${titleQuery}" (language: ${targetLanguage}) using query...`,
    );

    try {
      // Define the filter function passed to query(), it receives the document value
      const filterFn = (doc) => {
        const title = doc.title && doc.title[targetLanguage];
        // Ensure title is a string before matching
        if (title && typeof title === "string") {
          // Perform case-insensitive 'includes' match
          return title.toLowerCase().includes(lowerCaseQuery);
        }
        return false;
      };

      // Execute query(), it directly returns an array of matching document values
      const results = await this.db.query(filterFn);
      console.log(
        `Title query search completed, found ${results.length} matching records.`,
      );
      return results;
    } catch (error) {
      console.error(
        `Error searching by title query ('${titleQuery}', lang=${targetLanguage}):`,
        error,
      );
      throw error;
    }
  }

  /**
   * Searches for movies by keyword using query (POC implementation - full scan).
   * @param {string} keywordQuery - The keyword to search for.
   * @param {string} [targetLanguage='en'] - The language of the keywords to search ('en', 'zh', etc.).
   * @returns {Promise<Array<object>>} - Returns an array of matching document values (value[]).
   * @throws {Error} If the database is not initialized.
   */
  async searchMoviesByKeyword(keywordQuery, targetLanguage = "en") {
    if (!this.db) {
      throw new Error("Database not initialized. Cannot search by keyword.");
    }
    const lowerCaseQuery = keywordQuery.toLowerCase();
    console.log(
      `Searching by keyword "${keywordQuery}" (language: ${targetLanguage}) using query...`,
    );

    try {
      // Define the filter function
      const filterFn = (doc) => {
        const keywords = doc.keywords && doc.keywords[targetLanguage];
        // Ensure keywords is an array before matching
        if (keywords && Array.isArray(keywords)) {
          // Use 'some' to check if any keyword in the array includes the query term
          return keywords.some(
            (kw) =>
              typeof kw === "string" &&
              kw.toLowerCase().includes(lowerCaseQuery),
          );
        }
        return false;
      };

      // Execute query
      const results = await this.db.query(filterFn);
      console.log(
        `Keyword query search completed, found ${results.length} matching records.`,
      );
      return results;
    } catch (error) {
      console.error(
        `Error searching by keyword query ('${keywordQuery}', lang=${targetLanguage}):`,
        error,
      );
      throw error;
    }
  }

  /**
   * Deletes a document by its IMDb ID (_id).
   * @param {string} imdbId - The IMDb ID of the movie to delete.
   * @returns {Promise<string|null>} - Returns the hash of the delete operation, or null if the document was not found.
   * @throws {Error} If the database is not initialized or another error occurs during deletion.
   */
  async deleteMovieByImdbId(imdbId) {
    if (!this.db) {
      throw new Error("Database not initialized. Cannot delete movie.");
    }
    // Basic validation for the input imdbId
    if (!imdbId || typeof imdbId !== "string" || !imdbId.startsWith("tt")) {
      console.warn(
        `Attempting to delete movie with invalid IMDb ID: ${imdbId}`,
      );
      return null; // Invalid ID, return null directly
    }
    console.log(`Attempting to delete movie with _id '${imdbId}'...`);
    try {
      // del(key) uses the _id to delete
      const hash = await this.db.del(imdbId);
      console.log(
        `Movie (_id: ${imdbId}) deleted successfully, operation hash: ${hash}`,
      );
      return hash; // Return the hash of the delete operation
    } catch (error) {
      // Handle "key not found" errors gracefully, as they are expected if trying to delete non-existent entry
      // Note: Specific error message might vary across OrbitDB versions
      if (
        error.message &&
        (error.message.toLowerCase().includes("not found") ||
          error.message.includes("No document with key"))
      ) {
        console.warn(
          `Attempted to delete non-existent movie (_id: ${imdbId}). Operation skipped.`,
        );
        return null; // Return null to indicate not found / not deleted
      }
      // For other types of errors, rethrow them
      console.error(`Unexpected error deleting movie (_id: ${imdbId}):`, error);
      throw error;
    }
  }

  /**
   * Closes the OrbitDB database connection.
   * @returns {Promise<void>}
   */
  async close() {
    if (!this.db) {
      console.log(
        "Database not initialized or already closed. No need to close again.",
      );
      return;
    }
    const addressToClose = this.dbAddress; // Store address for logging before clearing
    try {
      console.log(`Closing database ${addressToClose}...`);
      await this.db.close(); // Close the database connection and associated resources
      console.log(`Database ${addressToClose} closed successfully.`);
      this.db = null; // Clear the instance reference
      this.dbAddress = null;
    } catch (error) {
      console.error(`Error closing database ${addressToClose}:`, error);
      // Attempt to clear references even if closing failed
      this.db = null;
      this.dbAddress = null;
      throw error; // Rethrow the error so the caller knows closing failed
    }
  }
}
