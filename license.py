import os
import sys

# --- Configuration ---
# The header text to be added to the files.
HEADER_TEXT = """/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */
"""

def should_add_header(file_path):
    """
    Checks if a file should receive the commercial license header.
    Returns True if 'private' is in the path or file content.
    """
    # Check if 'private' is in the file path (case-insensitive)
    if 'server/private' in file_path.lower():
        return True

    # Check if 'private' is in the file content (case-insensitive)
    # try:
    #     with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
    #         content = f.read()
    #         if 'private' in content.lower():
    #             return True
    # except Exception as e:
    #     print(f"Could not read file {file_path}: {e}")

    return False

def process_directory(root_dir):
    """
    Recursively scans a directory and adds headers to qualifying .ts or .tsx files,
    skipping any 'node_modules' directories.
    """
    print(f"Scanning directory: {root_dir}")
    files_processed = 0
    headers_added = 0

    for root, dirs, files in os.walk(root_dir):
        # --- MODIFICATION ---
        # Exclude 'node_modules' directories from the scan to improve performance.
        if 'node_modules' in dirs:
            dirs.remove('node_modules')

        for file in files:
            if file.endswith('.ts') or file.endswith('.tsx'):
                file_path = os.path.join(root, file)
                files_processed += 1

                try:
                    with open(file_path, 'r+', encoding='utf-8') as f:
                        original_content = f.read()
                        has_header = original_content.startswith(HEADER_TEXT.strip())
                        
                        if should_add_header(file_path):
                            # Add header only if it's not already there
                            if not has_header:
                                f.seek(0, 0) # Go to the beginning of the file
                                f.write(HEADER_TEXT.strip() + '\n\n' + original_content)
                                print(f"Added header to: {file_path}")
                                headers_added += 1
                            else:
                                print(f"Header already exists in: {file_path}")
                        else:
                            # Remove header if it exists but shouldn't be there
                            if has_header:
                                # Find the end of the header and remove it (including following newlines)
                                header_with_newlines = HEADER_TEXT.strip() + '\n\n'
                                if original_content.startswith(header_with_newlines):
                                    content_without_header = original_content[len(header_with_newlines):]
                                else:
                                    # Handle case where there might be different newline patterns
                                    header_end = len(HEADER_TEXT.strip())
                                    # Skip any newlines after the header
                                    while header_end < len(original_content) and original_content[header_end] in '\n\r':
                                        header_end += 1
                                    content_without_header = original_content[header_end:]
                                
                                f.seek(0)
                                f.write(content_without_header)
                                f.truncate()
                                print(f"Removed header from: {file_path}")
                                headers_added += 1  # Reusing counter for modifications

                except Exception as e:
                    print(f"Error processing file {file_path}: {e}")

    print("\n--- Scan Complete ---")
    print(f"Total .ts or .tsx files found: {files_processed}")
    print(f"Files modified (headers added/removed): {headers_added}")


if __name__ == "__main__":
    # Get the target directory from the command line arguments.
    # If no directory is provided, it uses the current directory ('.').
    if len(sys.argv) > 1:
        target_directory = sys.argv[1]
    else:
        target_directory = '.' # Default to current directory

    if not os.path.isdir(target_directory):
        print(f"Error: Directory '{target_directory}' not found.")
        sys.exit(1)

    process_directory(os.path.abspath(target_directory))
