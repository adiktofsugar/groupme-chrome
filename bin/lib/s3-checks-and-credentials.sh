#!/bin/bash
project_root="$(cd `dirname ${BASH_SOURCE[0]}`; cd ../..; pwd)"


s3cmd_version_string="$(s3cmd --version)"
s3cmd_major_version=
s3cmd_minor_version=
if [[ "$s3cmd_version_string" =~ version\ ([0-9]+)\.([0-9]+)\.([0-9]+) ]]; then
    s3cmd_major_version="${BASH_REMATCH[1]}"
    s3cmd_minor_version="${BASH_REMATCH[2]}"
    s3cmd_patch_version="${BASH_REMATCH[3]}"
    if [[ "$s3cmd_major_version" = "1" ]] && \
        [[ "$s3cmd_major_version" -lt 2 ]] &&\
        [[ "$s3cmd_minor_version" -lt 5 ]]; then
        echo "You need s3cmd version at least 1.5 to use this." >&2
        echo "Go to http://s3tools.org/download and download the latest." >&2
        exit 1
    fi
fi

s3_access_key=
s3_secret_key=
s3_saved_config_path="$project_root/.saved-s3-config.sh"

load_credentials() {
    if ! [[ -e "$s3_saved_config_path" ]]; then
        save_credentials
    fi
    source "$s3_saved_config_path"    
    s3_access_key="${S3_ACCESS_KEY:-}"
    s3_secret_key="${S3_SECRET_KEY:-}"
    if [[ -z "$s3_access_key" ]] || [[ -z "$s3_secret_key" ]]; then
        echo "You have not saved your s3 access and secret keys"
        save_credentials
        load_credentials
    fi
}

save_credentials() {
    echo "Enter your s3 access key and press [ENTER]:"
    read s3_access_key
    echo "Enter your s3 secret key and press [ENTER]:"
    read s3_secret_key
    echo "
    S3_ACCESS_KEY="$s3_access_key"
    S3_SECRET_KEY="$s3_secret_key"
    " > "$s3_saved_config_path"
}

load_credentials
